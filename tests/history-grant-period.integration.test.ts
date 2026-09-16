import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { CheckHistoryAccess } from "@/modules/school/application/check-history-access";
import { GrantHistoryAccess } from "@/modules/school/application/grant-history-access";
import { UpdateHistoryGrant } from "@/modules/school/application/update-history-grant";

// T112: execution is waived. Opt in only to the isolated school PostgreSQL database.
const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

const scope = {
  activities: true, metrics: false, prescribedWorkouts: false, compliance: false,
  coachScores: false, coachComments: false, assessments: false, athleteFeedback: false,
};
const now = new Date("2026-09-15T12:00:00Z");

describe.skipIf(!db).each(["SCHOOL", "COACH"] as const)("history period sharing with %s [T112]", (granteeType) => {
  let athleteId: string;
  let recipientUserId: string;
  let schoolId: string;
  let coachId: string;
  let granteeId: string;
  let grant: GrantHistoryAccess;
  let check: CheckHistoryAccess;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    athleteId = `period-athlete-${suffix}`;
    recipientUserId = `period-recipient-${suffix}`;
    schoolId = `period-school-${suffix}`;
    coachId = `period-coach-${suffix}`;
    await db!.user.createMany({ data: [athleteId, recipientUserId].map((id) => ({
      id, email: `${id}@example.invalid`, status: "ACTIVE" as const,
    })) });
    await db!.school.create({ data: { id: schoolId, name: "Period school", slug: schoolId, ownerUserId: recipientUserId } });
    await db!.coachProfile.create({ data: { id: coachId, userId: recipientUserId, displayName: "Period coach" } });
    granteeId = granteeType === "SCHOOL" ? schoolId : coachId;
    grant = new GrantHistoryAccess(db!, () => now);
    check = new CheckHistoryAccess(db!);
  });

  afterEach(async () => {
    // Only this case's synthetic fixture is removed, respecting historical FK order.
    if (!athleteId) return;
    await db!.historyAccessGrant.deleteMany({ where: { athleteId } });
    await db!.coachProfile.deleteMany({ where: { id: coachId } });
    await db!.school.deleteMany({ where: { id: schoolId } });
    await db!.user.deleteMany({ where: { id: { in: [athleteId, recipientUserId] } } });
  });

  async function allowed(timestamp: string) {
    return check.execute({ athleteId, granteeType, granteeId, category: "activities", occurredAt: new Date(timestamp) });
  }

  it("includes both full UTC boundary days and rejects one millisecond outside them", async () => {
    await grant.execute(athleteId, { granteeType, granteeId, scope, fromDate: "2020-02-28", toDate: "2020-02-29" });
    for (const timestamp of ["2020-02-28T00:00:00Z", "2020-02-28T12:00:00Z", "2020-02-29T00:00:00Z", "2020-02-29T23:59:59.999Z"]) {
      expect(await allowed(timestamp), timestamp).toBe(true);
    }
    for (const timestamp of ["2020-02-27T23:59:59.999Z", "2020-03-01T00:00:00Z"]) {
      expect(await allowed(timestamp), timestamp).toBe(false);
    }
    // Calendar bounds follow UTC even if the supplied timestamp has a local offset.
    expect(await allowed("2020-02-27T21:00:00-03:00")).toBe(true);
    expect(await allowed("2020-02-29T21:00:00-03:00")).toBe(false);
    expect(await allowed("2020-02-28T00:30:00+02:00")).toBe(false);
  });

  it("limits an equal-start-and-end grant to that single day", async () => {
    await grant.execute(athleteId, { granteeType, granteeId, scope, fromDate: "2020-12-31", toDate: "2020-12-31" });
    expect(await allowed("2020-12-30T23:59:59.999Z")).toBe(false);
    expect(await allowed("2020-12-31T00:00:00Z")).toBe(true);
    expect(await allowed("2020-12-31T23:59:59.999Z")).toBe(true);
    expect(await allowed("2021-01-01T00:00:00Z")).toBe(false);
  });

  it.each([
    { fromDate: null, toDate: "2020-02-29", before: true, after: false },
    { fromDate: "2020-02-28", toDate: null, before: false, after: true },
    { fromDate: null, toDate: null, before: true, after: true },
  ])("respects each independently open bound: $fromDate / $toDate", async ({ fromDate, toDate, before, after }) => {
    await grant.execute(athleteId, { granteeType, granteeId, scope, fromDate, toDate });
    expect(await allowed("2000-01-01T00:00:00Z")).toBe(before);
    expect(await allowed("2020-02-28T00:00:00Z")).toBe(true);
    expect(await allowed("2020-02-29T23:59:59.999Z")).toBe(true);
    expect(await allowed("2030-01-01T00:00:00Z")).toBe(after);
  });

  it("does not fill the unshared gap between separate grants", async () => {
    for (const day of ["2020-02-27", "2020-02-29"]) {
      await grant.execute(athleteId, { granteeType, granteeId, scope, fromDate: day, toDate: day });
    }
    expect(await allowed("2020-02-27T23:59:59.999Z")).toBe(true);
    expect(await allowed("2020-02-28T00:00:00Z")).toBe(false);
    expect(await allowed("2020-02-28T23:59:59.999Z")).toBe(false);
    expect(await allowed("2020-02-29T00:00:00Z")).toBe(true);
  });

  it("applies a narrowed period to the next access check", async () => {
    const created = await grant.execute(athleteId, { granteeType, granteeId, scope, fromDate: "2020-02-01", toDate: "2020-03-31" });
    expect(await allowed("2020-02-28T23:59:59.999Z")).toBe(true);
    expect(await allowed("2020-03-01T00:00:00Z")).toBe(true);
    await new UpdateHistoryGrant(db!, () => new Date(now.getTime() + 1)).execute(athleteId, {
      grantId: created.id, fromDate: "2020-02-29", toDate: "2020-02-29",
    });
    expect(await allowed("2020-02-28T23:59:59.999Z")).toBe(false);
    expect(await allowed("2020-02-29T00:00:00Z")).toBe(true);
    expect(await allowed("2020-02-29T23:59:59.999Z")).toBe(true);
    expect(await allowed("2020-03-01T00:00:00Z")).toBe(false);
  });
});
