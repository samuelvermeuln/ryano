import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HistoryGranteeType } from "../domain/enums";
import { historyGrantScopeSchema } from "../domain/history-access-grant";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const checkHistoryAccessSchema = z.strictObject({
  athleteId: opaqueId,
  granteeType: z.enum(HistoryGranteeType),
  granteeId: opaqueId,
  category: historyGrantScopeSchema.keyof(),
  occurredAt: z.date(),
});

/**
 * Consent lookup only: callers must resolve/authorize the recipient identity server-side.
 * This is not an HTTP actor authorization policy. Never pass an unchecked client grantee.
 * Infrastructure errors propagate; callers must not interpret failure as permission.
 */
export class CheckHistoryAccess {
  constructor(private readonly db: Pick<PrismaClient | Prisma.TransactionClient, "historyAccessGrant">) {}

  async execute(raw: unknown): Promise<boolean> {
    const parsed = checkHistoryAccessSchema.safeParse(raw);
    if (!parsed.success) return false;
    const { athleteId, granteeType, granteeId, category, occurredAt } = parsed.data;
    // Grant bounds are inclusive UTC DATEs, including the entire final calendar day.
    const day = new Date(occurredAt);
    day.setUTCHours(0, 0, 0, 0);
    const match = await this.db.historyAccessGrant.findFirst({
      where: {
        athleteId, grantedBy: athleteId, granteeType, granteeId,
        schoolId: granteeType === HistoryGranteeType.SCHOOL ? granteeId : null,
        coachId: granteeType === HistoryGranteeType.COACH ? granteeId : null,
        status: "ACTIVE", revokedBy: null, revokedAt: null,
        scope: { path: [category], equals: true },
        AND: [
          { OR: [{ fromDate: null }, { fromDate: { lte: day } }] },
          { OR: [{ toDate: null }, { toDate: { gte: day } }] },
        ],
      },
      select: { id: true },
    });
    return match !== null;
  }
}
