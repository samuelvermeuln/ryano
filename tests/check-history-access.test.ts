import { describe, expect, it, vi } from "vitest";
import { CheckHistoryAccess } from "@/modules/athlete-history";
import { HistoryGrantStatus } from "@/modules/school/domain/enums";

const scope = {
  activities: true, metrics: false, prescribedWorkouts: false, compliance: false,
  coachScores: false, coachComments: false, assessments: false, athleteFeedback: false,
};
function database(grants: Array<Record<string, unknown>>) {
  const rows = grants.map((grant) => ({
    athleteId: "athlete-1", granteeType: "SCHOOL", granteeId: "school-1", status: HistoryGrantStatus.ACTIVE,
    fromDate: null, toDate: null, ...grant,
  }));
  const findMany = vi.fn().mockResolvedValue(rows);
  return { db: { historyAccessGrant: { findMany } }, findMany };
}
const request = {
  athleteId: "athlete-1", granteeType: "SCHOOL" as const, granteeId: "school-1",
  category: "activities" as const, occurredAt: new Date("2026-01-15"),
};

describe("CheckHistoryAccess [T107]", () => {
  it("allows only an active in-scope category and period", async () => {
    const { db, findMany } = database([{ scope, grantedAt: new Date("2026-01-01") }]);
    await expect(new CheckHistoryAccess(db as never, () => new Date("2026-02-01")).execute(request)).resolves.toBe(true);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        athleteId: "athlete-1", granteeType: "SCHOOL", granteeId: "school-1", status: HistoryGrantStatus.ACTIVE,
      }),
    }));
  });

  it("denies a missing scope, recipient mismatch, revoked grant, or future grant", async () => {
    await expect(new CheckHistoryAccess(database([]).db as never).execute(request)).resolves.toBe(false);
    await expect(new CheckHistoryAccess(database([{ scope: {}, grantedAt: new Date("2026-01-01") }]).db as never).execute(request)).resolves.toBe(false);
    await expect(new CheckHistoryAccess(database([{ scope, grantedAt: new Date("2026-03-01") }]).db as never, () => new Date("2026-02-01")).execute(request)).resolves.toBe(false);
    await expect(new CheckHistoryAccess(database([{ scope, grantedAt: new Date("2026-01-01"), granteeId: "school-2" }]).db as never).execute(request)).resolves.toBe(false);
    await expect(new CheckHistoryAccess(database([{ scope, grantedAt: new Date("2026-01-01"), status: HistoryGrantStatus.REVOKED }]).db as never).execute(request)).resolves.toBe(false);
  });

  it("relies on the repository's inclusive historical-period predicate", async () => {
    const { db, findMany } = database([]);
    await expect(new CheckHistoryAccess(db as never).execute(request)).resolves.toBe(false);
    const query = findMany.mock.calls[0][0];
    expect(query.where.AND).toEqual([
      { OR: [{ fromDate: null }, { fromDate: { lte: request.occurredAt } }] },
      { OR: [{ toDate: null }, { toDate: { gte: request.occurredAt } }] },
    ]);
  });

  it("rejects malformed requests before querying grants", async () => {
    const { db, findMany } = database([]);
    await expect(new CheckHistoryAccess(db as never).execute({ ...request, athleteId: " athlete-1" })).rejects.toThrow();
    expect(findMany).not.toHaveBeenCalled();
  });
});
