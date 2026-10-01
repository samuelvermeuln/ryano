import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { RequestSchoolMembership } from "@/modules/school/application/request-school-membership";
import { createCoachAthleteAssignment, transitionCoachAthleteAssignment } from "@/modules/school/domain/coach-athlete-assignment";
import { createCoachSchoolMembership, suspendCoachSchoolMembership, transitionCoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";
import { FULL_HISTORY_GRANT_SCOPE } from "@/modules/school/domain/history-access-grant";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership, type SchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";

const earlier = new Date("2026-09-01T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");

type Row = Record<string, unknown>;
type Where = { where: Record<string, unknown> };

function fixture() {
  const rows: SchoolAthleteMembership[] = [];
  const grants: Row[] = [];
  const assignments: Row[] = [];
  const audits: Row[] = [];
  const school: { id: string; status: string; joinPolicy: string } | null = { id: "school:opaque", status: "ACTIVE", joinPolicy: "REQUIRE_APPROVAL" };
  const db = {
    // The use case owns one serializable transaction; the mock just runs the body.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    school: { findUnique: vi.fn(async () => school) },
    schoolAthleteMembership: {
      findFirst: vi.fn(async ({ where }: Where) => rows.find((row) =>
        row.status === where.status && row.schoolId === where.schoolId && row.athleteId === where.athleteId) ?? null),
      create: vi.fn(async ({ data }: { data: SchoolAthleteMembership }) => { rows.push(data); return data; }),
    },
    coachSchoolMembership: { findFirst: vi.fn(async () => null as Row | null) },
    coachAthleteAssignment: {
      findFirst: vi.fn(async () => null as Row | null),
      findMany: vi.fn(async () => [] as Row[]),
      findUnique: vi.fn(async () => null as Row | null),
      update: vi.fn(async ({ data }: { data: Row }) => data),
      create: vi.fn(async ({ data }: { data: Row }) => { assignments.push(data); return data; }),
    },
    historyAccessGrant: {
      findFirst: vi.fn(async () => null as Row | null),
      create: vi.fn(async ({ data }: { data: Row }) => { grants.push(data); return data; }),
    },
    schoolAuditLog: { create: vi.fn(async ({ data }: { data: Row }) => { audits.push(data); return data; }) },
  };
  const clock = vi.fn(() => now);
  return { db, rows, grants, assignments, audits, clock, useCase: new RequestSchoolMembership(db as never, clock) };
}

/** An ACTIVE coach link at the school, optionally paused by the school. */
function activeCoachLink(suspended = false) {
  const active = transitionCoachSchoolMembership(
    createCoachSchoolMembership({ id: "link:coach", coachId: "coach:opaque", schoolId: "school:opaque" }, earlier), "ACTIVE", earlier,
  );
  return suspended ? suspendCoachSchoolMembership(active, "owner", earlier) : active;
}

it.each([null, "", " ", " user", "user ", "x".repeat(257)])("rejects invalid actor %j before data access [T053]", async (actor) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute(actor, "school:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
});

it.each(["", " ", " school", "school ", "x".repeat(257)])("rejects invalid school %j before data access [T053]", async (schoolId) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("user:opaque", schoolId)).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND", status: 404 });
  expect(db.school.findUnique).not.toHaveBeenCalled();
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
});

it.each([{ foo: 1 }, { shareHistory: "yes" }, { preferredCoachId: " coach" }, { actorId: "other" }])("rejects malformed options %j before data access [SAM-24]", async (raw) => {
  const { db, useCase } = fixture();
  await expect(useCase.execute("user:opaque", "school:opaque", raw)).rejects.toMatchObject({ name: "ZodError" });
  expect(db.$transaction).not.toHaveBeenCalled();
});

it("requests a pending manual membership using the authenticated User identity [T053]", async () => {
  const { db, useCase, clock } = fixture();
  const result = await useCase.execute("user:opaque", "school:opaque");
  expect(result).toMatchObject({ id: expect.any(String), athleteId: "user:opaque", schoolId: "school:opaque", joinSource: "MANUAL_SEARCH", status: "PENDING", startedAt: null, endedAt: null, approvedBy: null, approvedAt: null, createdAt: now, updatedAt: now });
  expect(db.school.findUnique).toHaveBeenCalledWith({ where: { id: "school:opaque" }, select: { id: true, status: true, joinPolicy: true } });
  expect(db.schoolAthleteMembership.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school:opaque", athleteId: "user:opaque", status: "ACTIVE" } });
  expect(db.schoolAthleteMembership.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school:opaque", athleteId: "user:opaque", status: "PENDING" } });
  expect(db.schoolAthleteMembership.create).toHaveBeenCalledExactlyOnceWith({ data: result });
  expect(clock).toHaveBeenCalledTimes(1);
  expect(db.$transaction).toHaveBeenCalledTimes(1);
});

it("shares the full history with the school by default, as the athlete's own consent, in the same transaction [SAM-24]", async () => {
  const { db, grants, audits, useCase } = fixture();
  const membership = await useCase.execute("user:opaque", "school:opaque");
  expect(grants).toHaveLength(1);
  expect(grants[0]).toMatchObject({
    athleteId: "user:opaque", grantedBy: "user:opaque", granteeType: "SCHOOL", granteeId: "school:opaque",
    schoolId: "school:opaque", coachId: null, scope: FULL_HISTORY_GRANT_SCOPE, fromDate: null, toDate: null,
    status: "ACTIVE", grantedAt: now, revokedAt: null,
  });
  expect(db.historyAccessGrant.findFirst).toHaveBeenCalledWith({
    where: { athleteId: "user:opaque", schoolId: "school:opaque", granteeType: "SCHOOL", status: "ACTIVE" }, select: { id: true },
  });
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({
    schoolId: "school:opaque", actorUserId: "user:opaque", action: "athlete_membership.requested",
    entityType: "SchoolAthleteMembership", entityId: membership.id,
    metadata: { athleteId: "user:opaque", joinSource: "MANUAL_SEARCH", shareHistory: true, preferredCoachId: null, grantId: grants[0]!.id, assignmentId: null },
  });
});

it("creates no grant when the athlete opts out of sharing [SAM-24]", async () => {
  const { db, audits, useCase } = fixture();
  await useCase.execute("user:opaque", "school:opaque", { shareHistory: false });
  expect(db.historyAccessGrant.findFirst).not.toHaveBeenCalled();
  expect(db.historyAccessGrant.create).not.toHaveBeenCalled();
  expect(audits[0]).toMatchObject({ metadata: { shareHistory: false, grantId: null } });
});

it("reuses an ACTIVE school grant instead of duplicating consent [SAM-24]", async () => {
  const { db, audits, useCase } = fixture();
  db.historyAccessGrant.findFirst.mockResolvedValue({ id: "grant:existing" });
  await useCase.execute("user:opaque", "school:opaque");
  expect(db.historyAccessGrant.create).not.toHaveBeenCalled();
  expect(audits[0]).toMatchObject({ metadata: { grantId: "grant:existing" } });
});

it("opens a PENDING primary assignment to the preferred coach when the coach is active at the school [SAM-24]", async () => {
  const { db, assignments, audits, useCase } = fixture();
  db.coachSchoolMembership.findFirst.mockResolvedValue(activeCoachLink());
  await useCase.execute("user:opaque", "school:opaque", { preferredCoachId: "coach:opaque" });
  expect(db.coachSchoolMembership.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school:opaque", coachId: "coach:opaque", status: "ACTIVE" } });
  expect(db.coachAthleteAssignment.findFirst).toHaveBeenCalledWith({
    where: { athleteId: "user:opaque", schoolId: "school:opaque", isPrimary: true, status: "PENDING" }, select: { id: true },
  });
  expect(assignments).toHaveLength(1);
  expect(assignments[0]).toMatchObject({
    athleteId: "user:opaque", coachId: "coach:opaque", schoolId: "school:opaque", isPrimary: true,
    status: "PENDING", startedAt: null, endedAt: null, assignedBy: null, createdAt: now,
  });
  expect(audits[0]).toMatchObject({ metadata: { preferredCoachId: "coach:opaque", assignmentId: assignments[0]!.id } });
});

it.each([
  ["absent", null, "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE"],
  ["suspended", activeCoachLink(true), "COACH_SCHOOL_MEMBERSHIP_SUSPENDED"],
])("refuses a %s preferred coach before writing the membership [SAM-24]", async (_label, link, code) => {
  const { db, useCase } = fixture();
  db.coachSchoolMembership.findFirst.mockResolvedValue(link);
  await expect(useCase.execute("user:opaque", "school:opaque", { preferredCoachId: "coach:opaque" })).rejects.toMatchObject({ code, status: 409 });
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
  expect(db.coachAthleteAssignment.create).not.toHaveBeenCalled();
  expect(db.historyAccessGrant.create).not.toHaveBeenCalled();
});

it("refuses a preferred coach when the athlete already has a PENDING coach request at the school [SAM-24]", async () => {
  const { db, useCase } = fixture();
  db.coachSchoolMembership.findFirst.mockResolvedValue(activeCoachLink());
  db.coachAthleteAssignment.findFirst.mockResolvedValue({ id: "assignment:open" });
  await expect(useCase.execute("user:opaque", "school:opaque", { preferredCoachId: "coach:opaque" })).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409 });
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
});

it("closes a coach assignment left ACTIVE at the school after the membership ended, instead of letting it block the request [SAM-26]", async () => {
  const { db, useCase } = fixture();
  const stale = transitionCoachAthleteAssignment(createCoachAthleteAssignment({
    id: "stale:1", athleteId: "user:opaque", coachId: "coach:old", schoolId: "school:opaque", isPrimary: true, sportType: null,
  }, earlier), "ACTIVE", earlier, "owner");
  db.coachAthleteAssignment.findMany.mockResolvedValue([{ id: "stale:1" }]);
  db.coachAthleteAssignment.findUnique.mockResolvedValue(stale);
  db.coachAthleteAssignment.update.mockImplementation(async ({ data }: { data: Row }) => ({ ...stale, ...data }));
  const result = await useCase.execute("user:opaque", "school:opaque");
  expect(result.status).toBe("PENDING");
  expect(db.coachAthleteAssignment.findMany).toHaveBeenCalledWith({
    where: { athleteId: "user:opaque", schoolId: "school:opaque", status: "ACTIVE" }, select: { id: true },
  });
  expect(db.coachAthleteAssignment.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "stale:1", status: "ACTIVE", updatedAt: stale.updatedAt },
    data: expect.objectContaining({ status: "ENDED", endedAt: now, endedBy: "user:opaque" }),
  }));
});

it.each([
  [null, "SCHOOL_NOT_FOUND", 404],
  [{ id: "school:opaque", status: "INACTIVE", joinPolicy: "REQUIRE_APPROVAL" }, "SCHOOL_INACTIVE", 409],
  [{ id: "school:opaque", status: "ACTIVE", joinPolicy: "INVITE_ONLY" }, "SCHOOL_INVITE_ONLY", 409],
] as const)("refuses absent, inactive or invite-only schools %j [T053, SAM-24]", async (school, code, status) => {
  const { db, useCase, clock } = fixture();
  db.school.findUnique.mockResolvedValue(school as never);
  await expect(useCase.execute("user:opaque", "school:opaque")).rejects.toMatchObject({ code, status });
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
  expect(clock).not.toHaveBeenCalled();
});

it("refuses an existing active membership without modifying its period [T053]", async () => {
  const { db, rows, useCase } = fixture();
  const active = transitionSchoolAthleteMembership(createSchoolAthleteMembership({ id: "period:old", athleteId: "user:opaque", schoolId: "school:opaque", joinSource: "MANUAL_SEARCH" }, now), "ACTIVE", now, "owner");
  rows.push(active);
  await expect(useCase.execute("user:opaque", "school:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_ACTIVE", status: 409 });
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
  expect(rows).toEqual([active]);
});

it("refuses a second request while one is still pending [SAM-24]", async () => {
  const { db, rows, useCase } = fixture();
  const pending = createSchoolAthleteMembership({ id: "period:pending", athleteId: "user:opaque", schoolId: "school:opaque", joinSource: "MANUAL_SEARCH" }, earlier);
  rows.push(pending);
  await expect(useCase.execute("user:opaque", "school:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_PENDING", status: 409 });
  expect(db.schoolAthleteMembership.create).not.toHaveBeenCalled();
  expect(db.historyAccessGrant.create).not.toHaveBeenCalled();
  expect(rows).toEqual([pending]);
});

it.each(["ENDED", "REVOKED", "REJECTED"] as const)("creates a new pending period after %s while preserving history [T053]", async (status) => {
  const { rows, useCase } = fixture();
  const pending = createSchoolAthleteMembership({ id: "period:old", athleteId: "user:opaque", schoolId: "school:opaque", joinSource: "MANUAL_SEARCH" }, now);
  const previous = status === "REJECTED" ? pending : transitionSchoolAthleteMembership(pending, "ACTIVE", now, "owner");
  const ended = transitionSchoolAthleteMembership(previous, status, now, "owner");
  rows.push(ended);
  const snapshot = structuredClone(ended);
  const result = await useCase.execute("user:opaque", "school:opaque");
  expect(result.id).not.toBe(ended.id);
  expect(result.status).toBe("PENDING");
  expect(result.startedAt).toBeNull();
  expect(rows).toEqual([snapshot, result]);
});

it("maps unique/foreign-key/serialization failures to a conflict and preserves other errors [SAM-24]", async () => {
  const { db, useCase } = fixture();
  db.schoolAthleteMembership.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }));
  await expect(useCase.execute("user:opaque", "school:opaque")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", status: 409 });
  const error = new Error("storage unavailable");
  db.schoolAthleteMembership.create.mockRejectedValueOnce(error);
  await expect(useCase.execute("user:opaque", "school:opaque")).rejects.toBe(error);
});
