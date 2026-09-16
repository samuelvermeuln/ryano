import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { historyAccessGrantSchema } from "../domain/history-access-grant";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const revokeHistoryAccessSchema = z.strictObject({ grantId: opaqueId });

/** Revocation ends future access while preserving the original consent and historical data. */
export class RevokeHistoryAccess {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = opaqueId.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const { grantId } = revokeHistoryAccessSchema.parse(raw);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(async (tx) => {
          const stored = await tx.historyAccessGrant.findUnique({ where: { id: grantId } });
          if (!stored) throw new SchoolError("HISTORY_GRANT_NOT_FOUND", "Permissão de histórico não encontrada.", 404);
          if (stored.athleteId !== actor.data || stored.grantedBy !== actor.data) {
            throw new SchoolError("FORBIDDEN", "Você não pode revogar esta permissão de histórico.", 403);
          }
          const grant = historyAccessGrantSchema.parse(stored);
          if (grant.status === "REVOKED") return grant;
          if (grant.status !== "ACTIVE") {
            throw new SchoolError("HISTORY_GRANT_NOT_ACTIVE", "A permissão de histórico não está ativa.", 409);
          }
          const now = z.date().parse(this.clock());
          if (now < grant.updatedAt) {
            throw new SchoolError("HISTORY_GRANT_INVALID_TIMESTAMP", "A data da revogação é inválida.", 400);
          }
          return historyAccessGrantSchema.parse(await tx.historyAccessGrant.update({
            where: { id: grant.id, athleteId: actor.data, grantedBy: actor.data,
              status: "ACTIVE", updatedAt: grant.updatedAt },
            data: { status: "REVOKED", revokedBy: actor.data, revokedAt: now, updatedAt: now },
          }));
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
          if (attempt < 2) continue;
          throw new SchoolError("HISTORY_GRANT_REVOKE_CONFLICT", "Não foi possível revogar o acesso. Atualize e tente novamente.", 409);
        }
        throw error;
      }
    }
  }
}
