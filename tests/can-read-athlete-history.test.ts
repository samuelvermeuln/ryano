import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { CanReadAthleteHistory } from "@/modules/school/application/can-read-athlete-history";

const now = new Date("2026-09-16T12:00:00Z");
const context = { athleteId: "athlete", schoolId: "school-b", category: "activities", occurredAt: new Date("2020-01-01") };
function setup() {
  const db = {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school-b", status: "ACTIVE" }) },
    schoolMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    coachProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue(null) },
    historyAccessGrant: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return { db, policy: new CanReadAthleteHistory(db as unknown as PrismaClient, () => now) };
}

describe("CanReadAthleteHistory [T109]", () => {
  it("allows the athlete's own history without a provider, coach, school or grant", async () => {
    const { db, policy } = setup();
    await expect(policy.execute("athlete", context)).resolves.toBe(true);
    expect(db.school.findUnique).not.toHaveBeenCalled();
    expect(db.historyAccessGrant.findFirst).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "ADMIN"])("requires explicit consent even for local %s", async (role) => {
    const { db, policy } = setup();
    db.schoolMembership.findFirst.mockResolvedValue({ id: "member", userId: "manager", schoolId: "school-b", status: "ACTIVE", endedAt: null });
    db.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "member", role }]);
    await expect(policy.execute("manager", context)).resolves.toBe(false);
    db.historyAccessGrant.findFirst.mockResolvedValue({ id: "grant" });
    await expect(policy.execute("manager", context)).resolves.toBe(true);
    expect(db.historyAccessGrant.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({
      athleteId: "athlete", granteeType: "SCHOOL", granteeId: "school-b", schoolId: "school-b", coachId: null,
      status: "ACTIVE", scope: { path: ["activities"], equals: true },
    }) }));
  });

  it("does not convert a coach assignment into permission for past periods", async () => {
    const { db, policy } = setup();
    db.coachAthleteAssignment.findFirst.mockResolvedValue({ id: "assignment" });
    await expect(policy.execute("coach-user", context)).resolves.toBe(false);
    db.historyAccessGrant.findFirst.mockResolvedValue({ id: "grant" });
    await expect(policy.execute("coach-user", context)).resolves.toBe(true);
    expect(db.coachAthleteAssignment.findFirst).toHaveBeenCalledWith({
      where: { athleteId: "athlete", schoolId: "school-b", status: "ACTIVE", endedAt: null, startedAt: { lte: now },
        coach: { userId: "coach-user", status: "ACTIVE", schoolMemberships: { some: {
          schoolId: "school-b", status: "ACTIVE", endedAt: null, startedAt: { lte: now },
        } } } }, select: { id: true },
    });
  });

  it("resolves an independent coach from the session and permits explicit consent without assignment", async () => {
    const { db, policy } = setup();
    db.coachProfile.findUnique.mockResolvedValue({ id: "coach-profile", userId: "coach-user", status: "ACTIVE" });
    db.historyAccessGrant.findFirst.mockResolvedValue({ id: "grant" });
    await expect(policy.execute("coach-user", { ...context, schoolId: null })).resolves.toBe(true);
    expect(db.coachProfile.findUnique).toHaveBeenCalledWith({ where: { userId: "coach-user" }, select: { id: true, userId: true, status: true } });
    expect(db.historyAccessGrant.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      granteeType: "COACH", granteeId: "coach-profile", coachId: "coach-profile", schoolId: null,
    }) }));
    expect(db.coachAthleteAssignment.findFirst).not.toHaveBeenCalled();
    expect(db.school.findUnique).not.toHaveBeenCalled();
  });

  it.each([null, { id: "coach", userId: "other", status: "ACTIVE" },
    { id: "coach", userId: "viewer", status: "INACTIVE" }])("denies an invalid coach identity before reading grants", async (coach) => {
    const { db, policy } = setup();
    db.coachProfile.findUnique.mockResolvedValue(coach);
    await expect(policy.execute("viewer", { ...context, schoolId: null })).resolves.toBe(false);
    expect(db.historyAccessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("does not fall back to independent coach consent when school authority is absent", async () => {
    const { db, policy } = setup();
    db.coachProfile.findUnique.mockResolvedValue({ id: "coach", userId: "viewer", status: "ACTIVE" });
    db.historyAccessGrant.findFirst.mockResolvedValue({ id: "grant" });
    await expect(policy.execute("viewer", context)).resolves.toBe(false);
    expect(db.coachProfile.findUnique).not.toHaveBeenCalled();
    expect(db.historyAccessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("denies inactive schools even when a grant exists", async () => {
    const { db, policy } = setup();
    db.school.findUnique.mockResolvedValue({ id: "school-b", status: "INACTIVE" });
    db.historyAccessGrant.findFirst.mockResolvedValue({ id: "grant" });
    await expect(policy.execute("viewer", context)).resolves.toBe(false);
    expect(db.historyAccessGrant.findFirst).not.toHaveBeenCalled();
  });

  it.each([{ ...context, granteeId: "school-a" }, { ...context, coachId: "other" },
    { ...context, role: "ADMIN" }, { ...context, category: "all" }, { ...context, occurredAt: new Date(NaN) }])(
    "denies injected identity or malformed context %j before queries", async (raw) => {
      const { db, policy } = setup();
      await expect(policy.execute("viewer", raw)).resolves.toBe(false);
      expect(db.school.findUnique).not.toHaveBeenCalled();
      expect(db.historyAccessGrant.findFirst).not.toHaveBeenCalled();
    },
  );

  it("returns safe authorization errors and never treats global admin as school authority", async () => {
    const { policy } = setup();
    await expect(policy.assert(null, context)).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    await expect(policy.assert("global-admin", context)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
