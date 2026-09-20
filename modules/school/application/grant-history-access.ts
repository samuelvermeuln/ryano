import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HistoryGranteeType } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createHistoryAccessGrant, historyAccessGrantSchema, historyGrantScopeSchema } from "../domain/history-access-grant";
import { schoolLogger } from "../infrastructure/logger";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);
const periodDate = z.union([z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)), z.date()])
  .nullish().transform((value) => value ?? null).pipe(historyAccessGrantSchema.shape.fromDate);

export const grantHistoryAccessSchema = z.strictObject({
  granteeType: z.enum(HistoryGranteeType),
  granteeId: opaqueId,
  fromDate: periodDate,
  toDate: periodDate,
  scope: historyGrantScopeSchema,
});

/** Consent belongs to the session athlete; operational membership grants no historical rights. */
export class GrantHistoryAccess {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const log = schoolLogger("grant-history-access");
    const actor = opaqueId.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = grantHistoryAccessSchema.parse(raw);
    const grant = createHistoryAccessGrant({
      ...input, id: randomUUID(), athleteId: actor.data, grantedBy: actor.data,
      schoolId: input.granteeType === HistoryGranteeType.SCHOOL ? input.granteeId : null,
      coachId: input.granteeType === HistoryGranteeType.COACH ? input.granteeId : null,
    }, this.clock());

    log.info("grant_history_start", { athleteId: actor.data, granteeType: input.granteeType, granteeId: input.granteeId, correlationId: log.correlationId });

    try {
      const result = await this.db.$transaction(async (tx) => {
        if (grant.schoolId) {
          const school = await tx.school.findUnique({
            where: { id: grant.schoolId }, select: { id: true, status: true },
          });
          if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
          if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
        } else {
          const coach = await tx.coachProfile.findUnique({
            where: { id: grant.granteeId }, select: { id: true, status: true },
          });
          if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Professor não encontrado.", 404);
          if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);
        }
        return historyAccessGrantSchema.parse(await tx.historyAccessGrant.create({ data: grant }));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      log.info("grant_history_granted", { grantId: result.id, athleteId: actor.data, correlationId: log.correlationId });
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        log.warn("grant_history_conflict", { athleteId: actor.data, granteeId: input.granteeId, correlationId: log.correlationId });
        throw new SchoolError("HISTORY_GRANT_CREATE_CONFLICT", "Não foi possível conceder o acesso. Atualize e tente novamente.", 409);
      }
      log.error("grant_history_failed", { error: String(error), correlationId: log.correlationId });
      throw error;
    }
  }
}
