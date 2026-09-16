import { type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HistoryGranteeType, HistoryGrantStatus } from "@/modules/school/domain/enums";
import { historyAccessScopeSchema } from "../domain/history-access-grant";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const checkHistoryAccessSchema = z.strictObject({
  athleteId: idSchema,
  granteeType: z.enum(HistoryGranteeType),
  granteeId: idSchema,
  category: z.enum(Object.keys(historyAccessScopeSchema.shape) as [keyof typeof historyAccessScopeSchema.shape, ...Array<keyof typeof historyAccessScopeSchema.shape>]),
  occurredAt: z.date(),
});

/** Evaluates explicit grants only; a school or coach relationship never implies history access. */
export class CheckHistoryAccess {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(raw: unknown): Promise<boolean> {
    const input = checkHistoryAccessSchema.parse(raw);
    const now = this.clock();
    const grants = await this.db.historyAccessGrant.findMany({
      where: {
        athleteId: input.athleteId,
        granteeType: input.granteeType,
        granteeId: input.granteeId,
        status: HistoryGrantStatus.ACTIVE,
        AND: [
          { OR: [{ fromDate: null }, { fromDate: { lte: input.occurredAt } }] },
          { OR: [{ toDate: null }, { toDate: { gte: input.occurredAt } }] },
        ],
      },
      select: {
        athleteId: true, granteeType: true, granteeId: true, status: true,
        scope: true, fromDate: true, toDate: true, grantedAt: true,
      },
      orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
    });
    return grants.some((grant) => {
      // Recheck the record because authorization must not trust a faulty repository filter.
      if (grant.athleteId !== input.athleteId || grant.granteeType !== input.granteeType
        || grant.granteeId !== input.granteeId || grant.status !== HistoryGrantStatus.ACTIVE
        || grant.grantedAt > now || (grant.fromDate && grant.fromDate > input.occurredAt)
        || (grant.toDate && grant.toDate < input.occurredAt)) return false;
      const scope = historyAccessScopeSchema.safeParse(grant.scope);
      return scope.success && scope.data[input.category];
    });
  }
}
