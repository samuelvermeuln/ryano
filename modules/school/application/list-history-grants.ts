import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { historyAccessGrantSchema } from "../domain/history-access-grant";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const listHistoryGrantsSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: opaqueId.optional(),
});

/** Only the consenting athlete can list their grants, including revoked consent. */
export class ListHistoryGrants {
  constructor(private readonly db: Pick<PrismaClient, "historyAccessGrant">) {}

  async execute(actorUserId: string | null, raw: unknown = {}) {
    const actor = opaqueId.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const { limit, cursor } = listHistoryGrantsSchema.parse(raw);
    const rows = await this.db.historyAccessGrant.findMany({
      where: {
        athleteId: actor.data, grantedBy: actor.data,
        ...(cursor === undefined ? {} : { id: { gt: cursor } }),
      },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map((row) => historyAccessGrantSchema.parse(row));
    return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
  }
}
