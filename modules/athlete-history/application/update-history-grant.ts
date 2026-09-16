import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "@/modules/school/domain/errors";
import { historyAccessScopeSchema } from "../domain/history-access-grant";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
const dateSchema = z.union([z.date(), z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`))]);
export const updateHistoryGrantSchema = z.strictObject({
  scope: historyAccessScopeSchema.optional(),
  fromDate: dateSchema.nullish(),
  toDate: dateSchema.nullish(),
}).refine((input) => Object.keys(input).length > 0, "Provide at least one change");

/** Edits a grant's future read scope; it never changes its recipient or author. */
export class UpdateHistoryGrant {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, grantId: string, raw: unknown) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const id = idSchema.parse(grantId);
    const input = updateHistoryGrantSchema.parse(raw);
    const now = this.clock();
    try {
      return await this.db.$transaction(async (tx) => {
        const grant = await tx.historyAccessGrant.findUnique({ where: { id } });
        if (!grant) throw new SchoolError("HISTORY_GRANT_NOT_FOUND", "Compartilhamento não encontrado.", 404);
        if (grant.athleteId !== actor.data) throw new SchoolError("FORBIDDEN", "Você não pode alterar este compartilhamento.", 403);
        if (grant.status !== "ACTIVE") throw new SchoolError("HISTORY_GRANT_NOT_ACTIVE", "O compartilhamento não está ativo.", 409);
        const fromDate = input.fromDate === undefined ? grant.fromDate : input.fromDate;
        const toDate = input.toDate === undefined ? grant.toDate : input.toDate;
        if (fromDate && toDate && fromDate > toDate) {
          throw new SchoolError("HISTORY_GRANT_INVALID_PERIOD", "O período informado é inválido.", 400);
        }
        return tx.historyAccessGrant.update({
          where: { id }, data: { ...input, fromDate, toDate, updatedAt: now },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("HISTORY_GRANT_UPDATE_CONFLICT", "Não foi possível atualizar o compartilhamento. Tente novamente.", 409);
      }
      throw error;
    }
  }
}
