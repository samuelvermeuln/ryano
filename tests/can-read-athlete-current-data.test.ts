import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { CanReadAthleteCurrentData } from "@/modules/school/application/can-read-athlete-current-data";

const now = new Date("2026-09-16T12:00:00Z");
const context = { athleteId: "athlete", schoolId: "school" };

function setup() {
  const db = {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school", status: "ACTIVE" }) },
    schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue({ id: "athlete-membership" }) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return { db, policy: new CanReadAthleteCurrentData(db as unknown as PrismaClient, () => now) };
}

describe("CanReadAthleteCurrentData [T108]", () => {
  it("permits the athlete's own data without requiring an operational relationship", async () => {
    const { db, policy } = setup();
    await expect(policy.execute("athlete", context)).resolves.toBe(true);
    await expect(policy.execute("athlete", { ...context, schoolId: null })).resolves.toBe(true);
    expect(db.school.findUnique).not.toHaveBeenCalled();
    expect(db.coachAthleteAssignment.findFirst).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "ADMIN"])("allows local %s only with the athlete active in that school", async (role) => {
    const { db, policy } = setup();
    db.schoolMembership.findFirst.mockResolvedValue({ id: "member", userId: "manager", schoolId: "school", status: "ACTIVE", endedAt: null });
    db.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "member", role }]);
    await expect(policy.execute("manager", context)).resolves.toBe(true);
    expect(db.schoolAthleteMembership.findFirst).toHaveBeenCalledWith({
      where: { ...context, status: "ACTIVE", endedAt: null, startedAt: { lte: now } }, select: { id: true },
    });
    expect(db.coachAthleteAssignment.findFirst).not.toHaveBeenCalled();
    db.schoolAthleteMembership.findFirst.mockResolvedValue(null);
    await expect(policy.execute("manager", context)).resolves.toBe(false);
  });

  it("requires the session user's active coach assignment and active coach-school period", async () => {
    const { db, policy } = setup();
    db.coachAthleteAssignment.findFirst.mockResolvedValue({ id: "assignment" });
    await expect(policy.execute("coach-user", context)).resolves.toBe(true);
    expect(db.coachAthleteAssignment.findFirst).toHaveBeenCalledWith({
      where: { ...context, status: "ACTIVE", endedAt: null, startedAt: { lte: now },
        coach: { userId: "coach-user", status: "ACTIVE", schoolMemberships: { some: {
          schoolId: "school", status: "ACTIVE", endedAt: null, startedAt: { lte: now },
        } } } },
      select: { id: true },
    });
  });

  it("keeps independent assignments in the null school context", async () => {
    const { db, policy } = setup();
    db.coachAthleteAssignment.findFirst.mockResolvedValue({ id: "assignment" });
    await expect(policy.execute("coach-user", { athleteId: "athlete", schoolId: null })).resolves.toBe(true);
    expect(db.coachAthleteAssignment.findFirst).toHaveBeenCalledWith({
      where: { athleteId: "athlete", schoolId: null, status: "ACTIVE", endedAt: null, startedAt: { lte: now },
        coach: { userId: "coach-user", status: "ACTIVE" } }, select: { id: true },
    });
    expect(db.school.findUnique).not.toHaveBeenCalled();
    expect(db.schoolMembership.findFirst).not.toHaveBeenCalled();
  });

  it.each([null, { id: "school", status: "INACTIVE" }, { id: "school", status: "SUSPENDED" }])(
    "denies unavailable schools before checking roles or assignments", async (school) => {
      const { db, policy } = setup();
      db.school.findUnique.mockResolvedValue(school);
      await expect(policy.execute("manager", context)).resolves.toBe(false);
      expect(db.schoolMembership.findFirst).not.toHaveBeenCalled();
      expect(db.coachAthleteAssignment.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each([
    { schoolId: "other-school", status: "ACTIVE", endedAt: null },
    { schoolId: "school", status: "PENDING", endedAt: null },
    { schoolId: "school", status: "ACTIVE", endedAt: now },
  ])("denies stale or cross-school admin relationships %j", async (period) => {
    const { db, policy } = setup();
    db.schoolMembership.findFirst.mockResolvedValue({ id: "member", userId: "manager", ...period });
    db.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "member", role: "ADMIN" }]);
    await expect(policy.execute("manager", context)).resolves.toBe(false);
  });

  it.each(["COACH", "STAFF", "ATHLETE"])("does not let the local %s role replace an active assignment", async (role) => {
    const { db, policy } = setup();
    db.schoolMembership.findFirst.mockResolvedValue({ id: "member", userId: "viewer", schoolId: "school", status: "ACTIVE", endedAt: null });
    db.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "member", role }]);
    await expect(policy.execute("viewer", context)).resolves.toBe(false);
  });

  it.each([null, {}, { athleteId: "" , schoolId: null }, { athleteId: "athlete" },
    { ...context, roles: ["ADMIN"] }, { ...context, coachId: "victim" }])(
    "denies malformed context %j before reading data", async (raw) => {
      const { db, policy } = setup();
      await expect(policy.execute("viewer", raw)).resolves.toBe(false);
      expect(db.school.findUnique).not.toHaveBeenCalled();
      expect(db.coachAthleteAssignment.findFirst).not.toHaveBeenCalled();
    },
  );

  it("returns safe authorization errors without revealing athlete records", async () => {
    const { policy } = setup();
    await expect(policy.assert(null, context)).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    await expect(policy.assert("global-admin", context)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
