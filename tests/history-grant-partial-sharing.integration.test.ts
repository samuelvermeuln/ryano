import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { CheckHistoryAccess } from "@/modules/school/application/check-history-access";
import { GrantHistoryAccess } from "@/modules/school/application/grant-history-access";
import { UpdateHistoryGrant } from "@/modules/school/application/update-history-grant";
import type { HistoryGrantScope } from "@/modules/school/domain/history-access-grant";

// T113: execution is waived; explicitly opt in using the isolated school database.
const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

const denied: HistoryGrantScope = {
  activities: false, metrics: false, prescribedWorkouts: false, compliance: false,
  coachScores: false, coachComments: false, assessments: false, athleteFeedback: false,
};
const categories = Object.keys(denied) as (keyof HistoryGrantScope)[];
const now = new Date("2026-09-15T12:00:00Z");

describe.skipIf(!db).each(["SCHOOL", "COACH"] as const)("partial history sharing with %s [T113]", (granteeType) => {
  let athleteId: string;
  let recipientUserId: string;
  let schoolId: string;
  let coachId: string;
  let granteeId: string;
  let grant: GrantHistoryAccess;
  let check: CheckHistoryAccess;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    athleteId = `partial-athlete-${suffix}`;
    recipientUserId = `partial-recipient-${suffix}`;
    schoolId = `partial-school-${suffix}`;
    coachId = `partial-coach-${suffix}`;
    await db!.user.createMany({ data: [athleteId, recipientUserId].map((id) => ({
      id, email: `${id}@example.invalid`, status: "ACTIVE" as const,
    })) });
    await db!.school.create({ data: { id: schoolId, name: "Partial school", slug: schoolId, ownerUserId: recipientUserId } });
    await db!.coachProfile.create({ data: { id: coachId, userId: recipientUserId, displayName: "Partial coach" } });
    granteeId = granteeType === "SCHOOL" ? schoolId : coachId;
    grant = new GrantHistoryAccess(db!, () => now);
    check = new CheckHistoryAccess(db!);
  });

  afterEach(async () => {
    if (!athleteId) return;
    await db!.historyAccessGrant.deleteMany({ where: { athleteId } });
    await db!.coachProfile.deleteMany({ where: { id: coachId } });
    await db!.school.deleteMany({ where: { id: schoolId } });
    await db!.user.deleteMany({ where: { id: { in: [athleteId, recipientUserId] } } });
  });

  async function expectScope(scope: HistoryGrantScope, date = "2020-01-15T12:00:00Z") {
    for (const category of categories) {
      // The public result is strictly boolean: no grant metadata or athlete data is returned.
      const result = await check.execute({ athleteId, granteeType, granteeId, category, occurredAt: new Date(date) });
      expect(result, `${category} at ${date}`).toBe(scope[category]);
    }
  }

  it.each(categories)("sharing only %s never implies consent for the other seven categories", async (category) => {
    const scope = { ...denied, [category]: true };
    await grant.execute(athleteId, { granteeType, granteeId, scope });
    await expectScope(scope);
  });

  it("enforces the design's partial scope without exposing scores, comments or assessments", async () => {
    const scope: HistoryGrantScope = {
      activities: true, metrics: true, prescribedWorkouts: true, compliance: true,
      coachScores: false, coachComments: false, assessments: false, athleteFeedback: true,
    };
    await grant.execute(athleteId, { granteeType, granteeId, scope });
    await expectScope(scope);
  });

  it("applies a restricted scope immediately and supports denying every category", async () => {
    const created = await grant.execute(athleteId, { granteeType, granteeId,
      scope: { ...denied, activities: true, metrics: true, coachComments: true },
    });
    const update = new UpdateHistoryGrant(db!, () => new Date(now.getTime() + 1));
    await update.execute(athleteId, { grantId: created.id, scope: { ...denied, activities: true } });
    await expectScope({ ...denied, activities: true });
    await update.execute(athleteId, { grantId: created.id, scope: denied });
    await expectScope(denied);
  });

  it("never combines a category from one grant with the period of another", async () => {
    await grant.execute(athleteId, { granteeType, granteeId, scope: { ...denied, activities: true },
      fromDate: "2020-01-01", toDate: "2020-01-31",
    });
    await grant.execute(athleteId, { granteeType, granteeId, scope: { ...denied, metrics: true },
      fromDate: "2020-02-01", toDate: "2020-02-29",
    });
    await expectScope({ ...denied, activities: true }, "2020-01-15T12:00:00Z");
    await expectScope({ ...denied, metrics: true }, "2020-02-15T12:00:00Z");
    await expectScope(denied, "2020-03-01T00:00:00Z");
  });

  it("accepts separate consents for the same period without broadening either scope", async () => {
    for (const category of ["activities", "athleteFeedback"] as const) {
      await grant.execute(athleteId, { granteeType, granteeId, scope: { ...denied, [category]: true } });
    }
    await expectScope({ ...denied, activities: true, athleteFeedback: true });
  });
});
