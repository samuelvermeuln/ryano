import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { AssignCoachToAthlete } from "@/modules/school/application/assign-coach-to-athlete";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";
import { createCoachSchoolMembership, transitionCoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";
import { createCoachAthleteAssignment, transitionCoachAthleteAssignment, type CoachAthleteAssignment } from "@/modules/school/domain/coach-athlete-assignment";

const now = new Date("2026-09-11T12:00:00Z");
const prior = new Date("2026-09-10T12:00:00Z");

function fixture() {
  const athlete = transitionSchoolAthleteMembership(createSchoolAthleteMembership({ id: "athlete-period", schoolId: "school", athleteId: "athlete", joinSource: "MANUAL_SEARCH" }, prior), "ACTIVE", prior);
  const coach = transitionCoachSchoolMembership(createCoachSchoolMembership({ id: "coach-period", schoolId: "school", coachId: "coach" }, prior), "ACTIVE", prior);
  const tx = {
    schoolMembership: { findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => where.userId === "owner" ? { id: "manager", schoolId: "school", userId: "owner", status: "ACTIVE", endedAt: null } : null) },
    schoolMembershipRole: { findMany: vi.fn(async () => [{ membershipId: "manager", role: "OWNER" }]) },
    school: { findUnique: vi.fn(async () => ({ id: "school", ownerUserId: "owner", status: "ACTIVE" }) as { id: string; ownerUserId: string; status: string } | null) },
    schoolAthleteMembership: { findFirst: vi.fn(async () => athlete as typeof athlete | null) },
    coachSchoolMembership: { findFirst: vi.fn(async () => coach as typeof coach | null) },
    coachAthleteAssignment: {
      findFirst: vi.fn(async (): Promise<CoachAthleteAssignment | null> => null),
      create: vi.fn(async ({ data }: { data: CoachAthleteAssignment }) => data),
    },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
  return { tx, db, useCase: new AssignCoachToAthlete(db as never, () => now) };
}

it("creates a new active primary period with actor and time in a serializable transaction [T064]", async () => {
  const { useCase, tx, db } = fixture();
  await expect(useCase.execute("owner", "school", "athlete", "coach")).resolves.toMatchObject({
    athleteId: "athlete", coachId: "coach", schoolId: "school", status: "ACTIVE", isPrimary: true,
    sportType: null, startedAt: now, endedAt: null, assignedBy: "owner", endedBy: null, createdAt: now, updatedAt: now,
  });
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  expect(tx.schoolAthleteMembership.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school", athleteId: "athlete", status: "ACTIVE" } });
  expect(tx.coachSchoolMembership.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school", coachId: "coach", status: "ACTIVE" } });
  expect(tx.coachAthleteAssignment.create).toHaveBeenCalledTimes(1);
});

it.each([null, "", " owner", "x".repeat(257)])("rejects invalid actor %j before opening a transaction [T064]", async (actor) => {
  const { useCase, db } = fixture();
  await expect(useCase.execute(actor, "school", "athlete", "coach")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(db.$transaction).not.toHaveBeenCalled();
});

it.each([0, 1, 2])("validates identifier at position %i before persistence [T064]", async (position) => {
  const { useCase, db } = fixture();
  const ids: [string, string, string] = ["school", "athlete", "coach"];
  ids[position] = " bad ";
  await expect(useCase.execute("owner", ...ids)).rejects.toMatchObject({ status: 400 });
  expect(db.$transaction).not.toHaveBeenCalled();
});

it.each(["missing", "inactive", "other-owner"])("rejects %s school before membership reads [T064]", async (scenario) => {
  const { useCase, tx } = fixture();
  tx.school.findUnique.mockResolvedValue(scenario === "missing" ? null : { id: "school", ownerUserId: scenario === "other-owner" ? "other" : "owner", status: scenario === "inactive" ? "INACTIVE" : "ACTIVE" });
  if (scenario === "other-owner") tx.schoolMembership.findFirst.mockResolvedValue(null);
  await expect(useCase.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({ status: scenario === "missing" ? 404 : scenario === "inactive" ? 409 : 403 });
  expect(tx.schoolAthleteMembership.findFirst).not.toHaveBeenCalled();
  expect(tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it.each(["athlete", "coach"])("requires active %s membership in the target school [T064]", async (member) => {
  const { useCase, tx } = fixture();
  if (member === "athlete") tx.schoolAthleteMembership.findFirst.mockResolvedValue(null);
  else tx.coachSchoolMembership.findFirst.mockResolvedValue(null);
  await expect(useCase.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({ code: member === "athlete" ? "SCHOOL_ATHLETE_MEMBERSHIP_NOT_ACTIVE" : "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", status: 409 });
  expect(tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it("preserves an existing primary assignment even when assigning the same coach [T064]", async () => {
  const { useCase, tx } = fixture();
  const current = transitionCoachAthleteAssignment(createCoachAthleteAssignment({ id: "existing", schoolId: "school", athleteId: "athlete", coachId: "coach", isPrimary: true, sportType: null }, prior), "ACTIVE", prior, "owner");
  tx.coachAthleteAssignment.findFirst.mockResolvedValue(current);
  await expect(useCase.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409 });
  expect(tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it.each(["P2002", "P2034", "P2025"])("translates concurrent write %s to conflict [T064]", async (code) => {
  const { useCase, db } = fixture();
  db.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("conflict", { code, clientVersion: "6" }));
  await expect(useCase.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409 });
});

it("preserves unexpected storage errors [T064]", async () => {
  const { useCase, tx } = fixture();
  const error = new Error("storage unavailable");
  tx.coachAthleteAssignment.create.mockRejectedValue(error);
  await expect(useCase.execute("owner", "school", "athlete", "coach")).rejects.toBe(error);
});

it("allows a school owner who also coaches to explicitly assign their distinct coach profile [T078]", async () => {
  const { useCase, tx } = fixture();
  // The same person's authenticated User ID and CoachProfile ID are distinct identities.
  // Administrative ownership alone must not be used as the sporting relationship.
  await expect(useCase.execute("owner", "school", "athlete", "coach")).resolves.toMatchObject({
    assignedBy: "owner", coachId: "coach", athleteId: "athlete", schoolId: "school", status: "ACTIVE",
  });
  expect(tx.coachSchoolMembership.findFirst).toHaveBeenCalledWith({
    where: { schoolId: "school", coachId: "coach", status: "ACTIVE" },
  });
  expect(tx.coachAthleteAssignment.create).toHaveBeenCalledTimes(1);
});

it("does not turn school administration into an active coaching membership [T078]", async () => {
  const { useCase, tx } = fixture();
  tx.coachSchoolMembership.findFirst.mockResolvedValue(null);
  await expect(useCase.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({
    code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", status: 409,
  });
  expect(tx.coachAthleteAssignment.findFirst).not.toHaveBeenCalled();
  expect(tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it("does not let an owner-coach replace another primary coach through assignment [T078]", async () => {
  const { useCase, tx } = fixture();
  const original = transitionCoachAthleteAssignment(createCoachAthleteAssignment({
    id: "previous-primary", schoolId: "school", athleteId: "athlete", coachId: "other-coach",
    isPrimary: true, sportType: null,
  }, prior), "ACTIVE", prior, "original-manager");
  tx.coachAthleteAssignment.findFirst.mockResolvedValue(original);
  await expect(useCase.execute("owner", "school", "athlete", "coach")).rejects.toMatchObject({
    code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409,
  });
  expect(original).toMatchObject({ coachId: "other-coach", assignedBy: "original-manager", status: "ACTIVE", endedAt: null });
  expect(tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it("does not grant assignment management to a non-owner global admin who also coaches [T078]", async () => {
  const { useCase, tx } = fixture();
  // This boundary accepts an authenticated identity, never a client/global role override.
  const admin = { id: "global-admin-user", role: "ADMIN", coachProfileId: "coach" };
  await expect(useCase.execute(admin.id, "school", "athlete", admin.coachProfileId)).rejects.toMatchObject({
    code: "FORBIDDEN", status: 403,
  });
  expect(tx.schoolAthleteMembership.findFirst).not.toHaveBeenCalled();
  expect(tx.coachSchoolMembership.findFirst).not.toHaveBeenCalled();
  expect(tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it("allows a local ADMIN who is not the owner to assign their distinct coach identity [T078]", async () => {
  const { useCase, tx } = fixture();
  tx.schoolMembership.findFirst.mockResolvedValue({
    id: "admin-membership", schoolId: "school", userId: "local-admin-user", status: "ACTIVE", endedAt: null,
  });
  tx.schoolMembershipRole.findMany.mockResolvedValue([
    { membershipId: "admin-membership", role: "ADMIN" },
    { membershipId: "admin-membership", role: "COACH" },
  ]);

  await expect(useCase.execute("local-admin-user", "school", "athlete", "coach")).resolves.toMatchObject({
    assignedBy: "local-admin-user", coachId: "coach", athleteId: "athlete", schoolId: "school", status: "ACTIVE",
  });
  expect(tx.schoolMembership.findFirst).toHaveBeenCalledWith({
    where: { schoolId: "school", userId: "local-admin-user", status: "ACTIVE" },
  });
  expect(tx.coachSchoolMembership.findFirst).toHaveBeenCalledWith({
    where: { schoolId: "school", coachId: "coach", status: "ACTIVE" },
  });
  expect(tx.coachAthleteAssignment.create).toHaveBeenCalledTimes(1);
});

it("requires the sporting membership even when the local administrator has a COACH role [T078]", async () => {
  const { useCase, tx } = fixture();
  tx.schoolMembership.findFirst.mockResolvedValue({
    id: "admin-membership", schoolId: "school", userId: "local-admin-user", status: "ACTIVE", endedAt: null,
  });
  tx.schoolMembershipRole.findMany.mockResolvedValue([
    { membershipId: "admin-membership", role: "ADMIN" },
    { membershipId: "admin-membership", role: "COACH" },
  ]);
  tx.coachSchoolMembership.findFirst.mockResolvedValue(null);

  await expect(useCase.execute("local-admin-user", "school", "athlete", "coach")).rejects.toMatchObject({
    code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", status: 409,
  });
  expect(tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it("does not retain administrative assignment powers with only a local COACH role [T078]", async () => {
  const { useCase, tx } = fixture();
  tx.schoolMembership.findFirst.mockResolvedValue({
    id: "coach-membership", schoolId: "school", userId: "local-coach-user", status: "ACTIVE", endedAt: null,
  });
  tx.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "coach-membership", role: "COACH" }]);

  await expect(useCase.execute("local-coach-user", "school", "athlete", "coach")).rejects.toMatchObject({
    code: "FORBIDDEN", status: 403,
  });
  expect(tx.schoolAthleteMembership.findFirst).not.toHaveBeenCalled();
  expect(tx.coachSchoolMembership.findFirst).not.toHaveBeenCalled();
  expect(tx.coachAthleteAssignment.create).not.toHaveBeenCalled();
});
