import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { CanReadAthleteCurrentData } from "@/modules/school/application/can-read-athlete-current-data";
import { CanReadAthleteHistory } from "@/modules/school/application/can-read-athlete-history";
import { CheckHistoryAccess } from "@/modules/school/application/check-history-access";
import { GrantHistoryAccess } from "@/modules/school/application/grant-history-access";
import { RevokeHistoryAccess } from "@/modules/school/application/revoke-history-access";
import type { HistoryGrantScope } from "@/modules/school/domain/history-access-grant";

// T114: execution is waived; opt in only with the isolated school database.
const url = process.env.SCHOOL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55439" || !/^\/school_(dev|shadow|test)$/.test(parsed.pathname)) {
    throw new Error("School database tests require the isolated local PostgreSQL instance");
  }
}
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
afterAll(async () => { await db?.$disconnect(); });

const now = new Date("2026-09-16T12:00:00Z");
const revokedAt = new Date("2026-09-16T12:00:01Z");
const scope: HistoryGrantScope = {
  activities: true, metrics: true, prescribedWorkouts: true, compliance: true,
  coachScores: true, coachComments: true, assessments: true, athleteFeedback: true,
};
const categories = Object.keys(scope) as (keyof HistoryGrantScope)[];

describe.skipIf(!db).each(["SCHOOL", "COACH"] as const)("revoked %s grants [T114]", (granteeType) => {
  let athleteId: string;
  let recipientId: string;
  let schoolId: string;
  let coachId: string;
  let granteeId: string;
  let contextSchoolId: string | null;
  let grant: GrantHistoryAccess;
  let revoke: RevokeHistoryAccess;
  let check: CheckHistoryAccess;
  let history: CanReadAthleteHistory;
  let current: CanReadAthleteCurrentData;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    athleteId = `revoke-athlete-${suffix}`;
    recipientId = `revoke-recipient-${suffix}`;
    schoolId = `revoke-school-${suffix}`;
    coachId = `revoke-coach-${suffix}`;
    await db!.user.createMany({ data: [athleteId, recipientId].map((id) => ({
      id, email: `${id}@example.invalid`, status: "ACTIVE" as const,
    })) });
    await db!.school.create({ data: { id: schoolId, name: "Revocation school", slug: schoolId, ownerUserId: recipientId } });
    await db!.coachProfile.create({ data: { id: coachId, userId: recipientId, displayName: "Revocation coach" } });
    // School consent is consumed by an authorized local manager, not an arbitrary grantee ID.
    await db!.schoolMembership.create({ data: {
      schoolId, userId: recipientId, status: "ACTIVE", startedAt: now,
      roles: { create: { role: "OWNER" } },
    } });
    granteeId = granteeType === "SCHOOL" ? schoolId : coachId;
    contextSchoolId = granteeType === "SCHOOL" ? schoolId : null;
    grant = new GrantHistoryAccess(db!, () => now);
    revoke = new RevokeHistoryAccess(db!, () => revokedAt);
    check = new CheckHistoryAccess(db!);
    history = new CanReadAthleteHistory(db!, () => now);
    current = new CanReadAthleteCurrentData(db!, () => now);
  });

  afterEach(async () => {
    if (!athleteId) return;
    await db!.historyAccessGrant.deleteMany({ where: { athleteId } });
    await db!.coachAthleteAssignment.deleteMany({ where: { athleteId } });
    await db!.schoolAthleteMembership.deleteMany({ where: { athleteId } });
    await db!.schoolMembershipRole.deleteMany({ where: { membership: { schoolId } } });
    await db!.schoolMembership.deleteMany({ where: { schoolId } });
    await db!.coachProfile.deleteMany({ where: { id: coachId } });
    await db!.school.deleteMany({ where: { id: schoolId } });
    await db!.user.deleteMany({ where: { id: { in: [athleteId, recipientId] } } });
  });

  function context(category: keyof HistoryGrantScope = "activities") {
    return { athleteId, schoolId: contextSchoolId, category, occurredAt: new Date("2020-01-15T12:00:00Z") };
  }

  it("blocks every formerly shared category on the next read, retaining consent audit and self-access", async () => {
    const created = await grant.execute(athleteId, { granteeType, granteeId, scope });
    for (const category of categories) {
      await expect(history.execute(recipientId, context(category))).resolves.toBe(true);
    }
    const currentContext = { athleteId, schoolId: contextSchoolId };
    await expect(current.execute(recipientId, currentContext)).resolves.toBe(false);

    const revoked = await revoke.execute(athleteId, { grantId: created.id });
    expect(revoked).toMatchObject({ id: created.id, status: "REVOKED", revokedBy: athleteId, revokedAt });
    // Reuse the same policy instances to catch stale permission caching.
    for (const category of categories) {
      await expect(check.execute({ athleteId, granteeType, granteeId, category, occurredAt: context().occurredAt })).resolves.toBe(false);
      await expect(history.execute(recipientId, context(category))).resolves.toBe(false);
      await expect(history.assert(recipientId, context(category))).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expect(history.execute(athleteId, context(category))).resolves.toBe(true);
    }
    await expect(current.execute(recipientId, currentContext)).resolves.toBe(false);
    await expect(current.execute(athleteId, currentContext)).resolves.toBe(true);
    await expect(db!.historyAccessGrant.findUnique({ where: { id: created.id } })).resolves.toMatchObject({
      athleteId, grantedBy: athleteId, scope, status: "REVOKED", revokedBy: athleteId, revokedAt,
    });
    await expect(revoke.execute(athleteId, { grantId: created.id })).resolves.toEqual(revoked);
  });

  it("retains operational current access while denying historical access after revocation", async () => {
    if (granteeType === "SCHOOL") {
      await db!.schoolAthleteMembership.create({ data: {
        schoolId, athleteId, status: "ACTIVE", joinSource: "SCHOOL_INVITE", startedAt: now,
      } });
    } else {
      await db!.coachAthleteAssignment.create({ data: {
        athleteId, coachId, schoolId: null, status: "ACTIVE", startedAt: now,
      } });
    }
    const currentContext = { athleteId, schoolId: contextSchoolId };
    const created = await grant.execute(athleteId, { granteeType, granteeId, scope });
    await expect(current.execute(recipientId, currentContext)).resolves.toBe(true);
    await expect(history.execute(recipientId, context())).resolves.toBe(true);
    await revoke.execute(athleteId, { grantId: created.id });
    await expect(current.execute(recipientId, currentContext)).resolves.toBe(true);
    await expect(history.execute(recipientId, context())).resolves.toBe(false);
  });

  it("preserves a separate explicit consent until that consent is also revoked", async () => {
    const first = await grant.execute(athleteId, { granteeType, granteeId, scope });
    const second = await grant.execute(athleteId, { granteeType, granteeId, scope });
    await expect(history.execute(recipientId, context())).resolves.toBe(true);
    await revoke.execute(athleteId, { grantId: first.id });
    await expect(history.execute(recipientId, context())).resolves.toBe(true);
    await revoke.execute(athleteId, { grantId: second.id });
    await expect(history.execute(recipientId, context())).resolves.toBe(false);
  });
});
