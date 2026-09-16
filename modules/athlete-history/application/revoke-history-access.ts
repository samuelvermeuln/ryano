import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "@/modules/school/domain/errors";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** Revocation ends future reads while retaining the immutable grant record. */
export class RevokeHistoryAccess {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, grantId: string) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const id = idSchema.parse(grantId);
    const now = this.clock();
    try {
      return await this.db.$transaction(async (tx) => {
        const grant = await tx.historyAccessGrant.findUnique({ where: { id } });
        if (!grant) throw new SchoolError("HISTORY_GRANT_NOT_FOUND", "Compartilhamento não encontrado.", 404);
        if (grant.athleteId !== actor.data) throw new SchoolError("FORBIDDEN", "Você não pode revogar este compartilhamento.", 403);
        if (grant.status !== "ACTIVE") return grant;
        return tx.historyAccessGrant.update({
          where: { id }, data: { status: "REVOKED", revokedBy: actor.data, revokedAt: now, updatedAt: now },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("HISTORY_GRANT_REVOKE_CONFLICT", "Não foi possível revogar o compartilhamento. Tente novamente.", 409);
      }
      throw error;
    }
  }
}
