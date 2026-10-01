import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { ApproveAthleteMembership } from "@/modules/school/application/approve-athlete-membership";
import { createCoachAthleteAssignment, type CoachAthleteAssignment } from "@/modules/school/domain/coach-athlete-assignment";
import { createCoachSchoolMembership, suspendCoachSchoolMembership, transitionCoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership, type SchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";

const startedAt = new Date("2026-09-09T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");

function fixture() {
  let row: SchoolAthleteMembership | null = createSchoolAthleteMembership(
    { id: "period:opaque", athleteId: "athlete:opaque", joinSource: "MANUAL_SEARCH", schoolId: "school:opaque" }, startedAt,
  );
  const coachAssignments: CoachAthleteAssignment[] = [];
  const tx = {
    school: { findUnique: vi.fn(async () => ({ id: "school:opaque", ownerUserId: "owner:opaque", status: "ACTIVE" }) as { id: string; ownerUserId: string; status: string } | null) },
    schoolMembership: { findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => where.userId === "owner:opaque" ? { id: "manager", userId: where.userId, schoolId: "school:opaque", status: "ACTIVE", endedAt: null } : null) },
    schoolMembershipRole: { findMany: vi.fn(async () => [{ membershipId: "manager", role: "OWNER" }]) },
    schoolAthleteMembership: {
      findUnique: vi.fn(async () => row),
      // assignCoachToAthleteInTransaction re-reads the (now ACTIVE) membership.
      findFirst: vi.fn(async () => (row?.status === "ACTIVE" ? row : null)),
      update: vi.fn(async ({ data }: { data: Partial<SchoolAthleteMembership> }) => {
        row = { ...row!, ...data };
        return row;
      }),
    },
    // SAM-26 — preferred coach handling. Defaults: no preferred request, no coach link.
    coachSchoolMembership: { findFirst: vi.fn(async () => null as unknown) },
    coachAthleteAssignment: {
      findFirst: vi.fn(async () => null as unknown),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => coachAssignments.find((a) => a.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<CoachAthleteAssignment> }) => {
        const index = coachAssignments.findIndex((a) => a.id === where.id);
        coachAssignments[index] = { ...coachAssignments[index]!, ...data };
        return coachAssignments[index];
      }),
      create: vi.fn(async ({ data }: { data: CoachAthleteAssignment }) => { coachAssignments.push(data); return data; }),
    },
  };
  const db = { ...tx, $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
  const clock = vi.fn(() => now);
  // Only the transaction client exposes delegates, so any read outside the transaction fails.
  return { db, clock, coachAssignments, useCase: new ApproveAthleteMembership({ $transaction: db.$transaction } as never, clock), setRow: (value: SchoolAthleteMembership | null) => { row = value; }, getRow: () => row! };
}

const preferredRequest = (coachId: string) => createCoachAthleteAssignment({
  id: "pref:1", athleteId: "athlete:opaque", coachId, schoolId: "school:opaque", isPrimary: true, sportType: null,
}, startedAt);
const coachLink = (coachId: string, suspended = false) => {
  const active = transitionCoachSchoolMembership(createCoachSchoolMembership({ id: `link:${coachId}`, coachId, schoolId: "school:opaque" }, startedAt), "ACTIVE", startedAt);
  return suspended ? suspendCoachSchoolMembership(active, "owner:opaque", startedAt) : active;
};

it("without a coach choice, leaves the athlete's preferred-coach request PENDING for the coach to answer [SAM-26]", async () => {
  const { db, useCase, coachAssignments } = fixture();
  coachAssignments.push(preferredRequest("coach:1"));
  db.coachAthleteAssignment.findFirst.mockResolvedValueOnce({ id: "pref:1", coachId: "coach:1" });
  await useCase.execute("owner:opaque", "school:opaque", "period:opaque");
  expect(coachAssignments[0]!.status).toBe("PENDING");
  expect(db.coachAthleteAssignment.update).not.toHaveBeenCalled();
  expect(db.coachAthleteAssignment.create).not.toHaveBeenCalled();
});

it("confirming the preferred coach activates the athlete's request in the same transaction [SAM-26]", async () => {
  const { db, useCase, coachAssignments } = fixture();
  coachAssignments.push(preferredRequest("coach:1"));
  db.coachAthleteAssignment.findFirst.mockResolvedValueOnce({ id: "pref:1", coachId: "coach:1" });
  db.coachSchoolMembership.findFirst.mockResolvedValue(coachLink("coach:1"));
  await useCase.execute("owner:opaque", "school:opaque", "period:opaque", { coachId: "coach:1" });
  expect(coachAssignments[0]).toMatchObject({ status: "ACTIVE", startedAt: now, assignedBy: "owner:opaque" });
  expect(db.coachAthleteAssignment.create).not.toHaveBeenCalled();
  expect(db.$transaction).toHaveBeenCalledTimes(1);
});

it("choosing another coach rejects the athlete's request and opens the school's choice as ACTIVE [SAM-26]", async () => {
  const { db, useCase, coachAssignments } = fixture();
  coachAssignments.push(preferredRequest("coach:1"));
  db.coachAthleteAssignment.findFirst.mockResolvedValueOnce({ id: "pref:1", coachId: "coach:1" }).mockResolvedValueOnce(null);
  db.coachSchoolMembership.findFirst.mockResolvedValue(coachLink("coach:2"));
  await useCase.execute("owner:opaque", "school:opaque", "period:opaque", { coachId: "coach:2" });
  expect(coachAssignments[0]).toMatchObject({ id: "pref:1", status: "REJECTED", endedBy: "owner:opaque" });
  expect(coachAssignments[1]).toMatchObject({ coachId: "coach:2", status: "ACTIVE", isPrimary: true, assignedBy: "owner:opaque" });
});

it("refuses a suspended coach even when they were the athlete's preference [SAM-26]", async () => {
  const { db, useCase } = fixture();
  db.coachAthleteAssignment.findFirst.mockResolvedValueOnce({ id: "pref:1", coachId: "coach:1" });
  db.coachSchoolMembership.findFirst.mockResolvedValue(coachLink("coach:1", true));
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque", { coachId: "coach:1" })).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_SUSPENDED", status: 409 });
});

it.each([{ coachId: 1 }, { foo: "bar" }, { coachId: " x" }])("rejects malformed options %j before the transaction [SAM-26]", async (raw) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque", raw)).rejects.toMatchObject({ name: "ZodError" });
  expect(db.$transaction).not.toHaveBeenCalled();
});

it("approves only the pending athlete period, preserving identity and prior timestamps [T054]", async () => {
  const { db, clock, useCase, getRow } = fixture();
  const prior = structuredClone(getRow());
  const result = await useCase.execute("owner:opaque", "school:opaque", "period:opaque");
  expect(result).toEqual({ ...prior, status: "ACTIVE", approvedBy: "owner:opaque", approvedAt: now, startedAt: now, endedAt: null, updatedAt: now });
  expect(db.schoolAthleteMembership.update).toHaveBeenCalledExactlyOnceWith({
    where: { id: prior.id, status: "PENDING", updatedAt: startedAt },
    data: { status: "ACTIVE", approvedBy: "owner:opaque", approvedAt: now, startedAt: now, endedAt: null, rejectedBy: null, rejectedAt: null, revokedBy: null, revokedAt: null, updatedAt: now },
  });
  expect(clock).toHaveBeenCalledTimes(1);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
});

it("allows the local ADMIN role and does not require school ownership [T054]", async () => {
  const { db, useCase } = fixture();
  db.school.findUnique.mockResolvedValue({ id: "school:opaque", ownerUserId: "someone-else", status: "ACTIVE" });
  db.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "manager", role: "ADMIN" }]);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).resolves.toMatchObject({ status: "ACTIVE" });
});

it.each(["missing-membership", "ended-membership", "pending-membership", "coach-role", "foreign-role"])("denies %s even to the school owner [T054]", async (scenario) => {
  const { db, useCase } = fixture();
  if (scenario === "missing-membership") db.schoolMembership.findFirst.mockResolvedValue(null);
  if (scenario === "ended-membership" || scenario === "pending-membership") {
    db.schoolMembership.findFirst.mockResolvedValue({
      id: "manager", userId: "owner:opaque", schoolId: "school:opaque",
      status: scenario === "pending-membership" ? "PENDING" : "ACTIVE",
      endedAt: scenario === "ended-membership" ? now : null,
    } as never);
  }
  if (scenario === "coach-role") db.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "manager", role: "COACH" }]);
  if (scenario === "foreign-role") db.schoolMembershipRole.findMany.mockResolvedValue([{ membershipId: "other", role: "OWNER" }]);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("refuses inactive schools without changing a pending period [T054]", async () => {
  const { db, useCase } = fixture();
  db.school.findUnique.mockResolvedValue({ id: "school:opaque", ownerUserId: "owner:opaque", status: "INACTIVE" });
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_INACTIVE", status: 409 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it.each(["P2002", "P2025", "P2034"])("maps transaction conflict %s to a stable 409 [T054]", async (code) => {
  const { db, useCase } = fixture();
  db.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Conflict", { code, clientVersion: "6" }));
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", status: 409 });
});

it.each([null, "", " ", " owner", "owner ", "x".repeat(257)])("rejects invalid actor %j before database access [T054]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
});

it.each(["", " ", " target", "target ", "x".repeat(257)])("rejects malformed identifiers %j without persistence [T054]", async (invalid) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("owner:opaque", invalid, "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  await expect(useCase.execute("owner:opaque", "school:opaque", invalid)).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("refuses actors without an active local management membership [T054]", async () => {
  const { db, useCase } = fixture();
  for (const actor of ["global-admin", "coach:opaque", "other-owner"]) {
    await expect(useCase.execute(actor, "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  }
  expect(db.schoolAthleteMembership.findUnique).not.toHaveBeenCalled();
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("returns school not found without touching memberships [T054]", async () => {
  const { db, useCase } = fixture();
  db.school.findUnique.mockResolvedValue(null);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.findUnique).not.toHaveBeenCalled();
});

it.each(["absent", "other-school"])("hides %s membership and does not write [T054]", async (scenario) => {
  const { db, useCase, setRow, getRow } = fixture();
  setRow(scenario === "absent" ? null : { ...getRow(), schoolId: "other-school" });
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it.each(["ACTIVE", "REJECTED", "ENDED", "REVOKED"] as const)("does not approve a %s period [T054]", async (status) => {
  const { db, useCase, setRow, getRow } = fixture();
  const pending = createSchoolAthleteMembership({ id: "period:opaque", athleteId: "athlete:opaque", joinSource: "MANUAL_SEARCH", schoolId: "school:opaque" }, startedAt);
  setRow(status === "ACTIVE" || status === "REJECTED"
    ? transitionSchoolAthleteMembership(pending, status, startedAt)
    : transitionSchoolAthleteMembership(transitionSchoolAthleteMembership(pending, "ACTIVE", startedAt), status, startedAt));
  const prior = structuredClone(getRow());
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_INVALID_TRANSITION", status: 409 });
  expect(getRow()).toEqual(prior);
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("reports concurrent changes as a stable conflict [T054]", async () => {
  const { db, useCase } = fixture();
  db.schoolAthleteMembership.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Changed", { code: "P2025", clientVersion: "6" }));
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", status: 409 });
});

it("preserves unexpected persistence errors [T054]", async () => {
  const { db, useCase } = fixture();
  const error = new Error("storage unavailable");
  db.schoolAthleteMembership.update.mockRejectedValue(error);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toBe(error);
});

it.each([new Date(startedAt.getTime() - 1), new Date(Number.NaN)])("rejects an invalid decision time %s without changing the period [T054]", async (invalidTime) => {
  const { db, clock, useCase, getRow } = fixture();
  const prior = structuredClone(getRow());
  clock.mockReturnValue(invalidTime);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toBeInstanceOf(ZodError);
  expect(getRow()).toEqual(prior);
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});

it("returns not found when the period disappears before the transition read [T054]", async () => {
  const { db, useCase, getRow } = fixture();
  db.schoolAthleteMembership.findUnique.mockResolvedValueOnce(getRow()).mockResolvedValueOnce(null);
  await expect(useCase.execute("owner:opaque", "school:opaque", "period:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", status: 404 });
  expect(db.schoolAthleteMembership.update).not.toHaveBeenCalled();
});
