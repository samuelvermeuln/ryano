import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { historyAccessGrantSchema } from "../domain/history-access-grant";
import { grantHistoryAccessSchema } from "./grant-history-access";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const updateHistoryGrantSchema = grantHistoryAccessSchema.pick({ scope: true, fromDate: true, toDate: true })
  .partial().extend({ grantId: opaqueId }).refine((input) =>
    input.scope !== undefined || input.fromDate !== undefined || input.toDate !== undefined,
  "Informe o escopo ou período a alterar.");

export class UpdateHistoryGrant {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = opaqueId.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = updateHistoryGrantSchema.parse(raw);
    try {
      return await this.db.$transaction(async (tx) => {
        const stored = await tx.historyAccessGrant.findUnique({ where: { id: input.grantId } });
        if (!stored) throw new SchoolError("HISTORY_GRANT_NOT_FOUND", "Permissão de histórico não encontrada.", 404);
        if (stored.athleteId !== actor.data || stored.grantedBy !== actor.data) {
          throw new SchoolError("FORBIDDEN", "Você não pode alterar esta permissão de histórico.", 403);
        }
        const grant = historyAccessGrantSchema.parse(stored);
        if (grant.status !== "ACTIVE") {
          throw new SchoolError("HISTORY_GRANT_NOT_ACTIVE", "A permissão de histórico não está ativa.", 409);
        }
        const now = z.date().parse(this.clock());
        if (now < grant.updatedAt) {
          throw new SchoolError("HISTORY_GRANT_INVALID_TIMESTAMP", "A data da alteração é inválida.", 400);
        }
        const updated = historyAccessGrantSchema.parse({
          ...grant,
          scope: input.scope === undefined ? grant.scope : input.scope,
          fromDate: input.fromDate === undefined ? grant.fromDate : input.fromDate,
          toDate: input.toDate === undefined ? grant.toDate : input.toDate,
          updatedAt: now,
        });
        return historyAccessGrantSchema.parse(await tx.historyAccessGrant.update({
          where: { id: grant.id, athleteId: actor.data, grantedBy: actor.data,
            status: "ACTIVE", updatedAt: grant.updatedAt },
          data: { scope: updated.scope, fromDate: updated.fromDate, toDate: updated.toDate, updatedAt: now },
        }));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("HISTORY_GRANT_UPDATE_CONFLICT", "A permissão foi alterada. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
