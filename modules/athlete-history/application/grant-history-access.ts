import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HistoryGranteeType } from "@/modules/school/domain/enums";
import { SchoolError } from "@/modules/school/domain/errors";
import { createHistoryAccessGrant, historyAccessScopeSchema } from "../domain/history-access-grant";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
const dateSchema = z.union([z.date(), z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`))]);

export const grantHistoryAccessSchema = z.strictObject({
  athleteId: idSchema,
  granteeType: z.enum(HistoryGranteeType),
  granteeId: idSchema,
  scope: historyAccessScopeSchema,
  fromDate: dateSchema.nullish().transform((value) => value ?? null),
  toDate: dateSchema.nullish().transform((value) => value ?? null),
});

/** Grants are always created by the athlete who owns the history. */
export class GrantHistoryAccess {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = grantHistoryAccessSchema.parse(raw);
    if (input.athleteId !== actor.data) {
      throw new SchoolError("FORBIDDEN", "Somente o atleta pode compartilhar seu histórico.", 403);
    }

    const now = this.clock();
    const grant = createHistoryAccessGrant({
      id: randomUUID(),
      athleteId: input.athleteId,
      granteeType: input.granteeType,
      granteeId: input.granteeId,
      schoolId: input.granteeType === HistoryGranteeType.SCHOOL ? input.granteeId : null,
      coachId: input.granteeType === HistoryGranteeType.COACH ? input.granteeId : null,
      scope: input.scope,
      fromDate: input.fromDate,
      toDate: input.toDate,
      grantedBy: actor.data,
    }, now);

    try {
      return await this.db.$transaction(async (tx) => {
        if (grant.granteeType === HistoryGranteeType.SCHOOL) {
          const school = await tx.school.findUnique({
            where: { id: grant.granteeId }, select: { id: true, status: true },
          });
          if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
          if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
        } else {
          const coach = await tx.coachProfile.findUnique({
            where: { id: grant.granteeId }, select: { id: true, status: true },
          });
          if (!coach) throw new SchoolError("COACH_NOT_FOUND", "Professor não encontrado.", 404);
          if (coach.status !== "ACTIVE") throw new SchoolError("COACH_INACTIVE", "O professor não está ativo.", 409);
        }
        return tx.historyAccessGrant.create({ data: grant });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
        throw new SchoolError("HISTORY_GRANT_CREATE_CONFLICT", "Não foi possível conceder acesso ao histórico. Tente novamente.", 409);
      }
      throw error;
    }
  }
}
