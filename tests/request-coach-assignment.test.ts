import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { RequestCoachAssignment } from "@/modules/school/application/request-coach-assignment";
import { CancelCoachAssignmentRequest } from "@/modules/school/application/cancel-coach-assignment-request";
import { createCoachAthleteAssignment, transitionCoachAthleteAssignment, type CoachAthleteAssignment } from "@/modules/school/domain/coach-athlete-assignment";
import { createCoachSchoolMembership, suspendCoachSchoolMembership, transitionCoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";
import { FULL_HISTORY_GRANT_SCOPE } from "@/modules/school/domain/history-access-grant";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";

const earlier = new Date("2026-09-01T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");

type Row = Record<string, unknown>;

function fixture() {
  const assignments: CoachAthleteAssignment[] = [];
  const grants: Row[] = [];
  const audits: Row[] = [];
  const coach: Row | null = { id: "coach:opaque", userId: "user:coach", status: "ACTIVE" };
  const db = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    coachProfile: { findUnique: vi.fn(async () => coach) },
    school: { findUnique: vi.fn(async () => ({ id: "school:opaque", status: "ACTIVE" }) as Row | null) },
    schoolAthleteMembership: { findFirst: vi.fn(async () => null as Row | null) },
    coachSchoolMembership: { findFirst: vi.fn(async () => null as Row | null) },
    coachAthleteAssignment: {
      findFirst: vi.fn(async () => null as Row | null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => assignments.find((row) => row.id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: CoachAthleteAssignment }) => { assignments.push(data); return data; }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<CoachAthleteAssignment> }) => {
        const index = assignments.findIndex((row) => row.id === where.id);
        assignments[index] = { ...assignments[index]!, ...data };
        return assignments[index];
      }),
    },
    historyAccessGrant: {
      findFirst: vi.fn(async () => null as Row | null),
      create: vi.fn(async ({ data }: { data: Row }) => { grants.push(data); return data; }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    schoolAuditLog: { create: vi.fn(async ({ data }: { data: Row }) => { audits.push(data); return data; }) },
  };
  const clock = vi.fn(() => now);
  return {
    db, assignments, grants, audits, clock,
    request: new RequestCoachAssignment(db as never, clock),
    cancel: new CancelCoachAssignmentRequest(db as never, clock),
  };
}

const activeAthleteMembership = () => transitionSchoolAthleteMembership(
  createSchoolAthleteMembership({ id: "m:1", schoolId: "school:opaque", athleteId: "user:opaque", joinSource: "MANUAL_SEARCH" }, earlier), "ACTIVE", earlier, "owner",
);
const activeCoachLink = (suspended = false) => {
  const active = transitionCoachSchoolMembership(
    createCoachSchoolMembership({ id: "link:coach", coachId: "coach:opaque", schoolId: "school:opaque" }, earlier), "ACTIVE", earlier,
  );
  return suspended ? suspendCoachSchoolMembership(active, "owner", earlier) : active;
};

describe("RequestCoachAssignment [SAM-25]", () => {
  it.each([null, "", " ", "x".repeat(257)])("rejects invalid actor %j before data access", async (actor) => {
    const { db, request } = fixture();
    await expect(request.execute(actor, "coach:opaque")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([{ foo: 1 }, { shareHistory: "yes" }, { note: "" }, { athleteId: "other" }])("rejects malformed options %j before data access", async (raw) => {
    const { db, request } = fixture();
    await expect(request.execute("user:opaque", "coach:opaque", raw)).rejects.toMatchObject({ name: "ZodError" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("opens an independent PENDING primary assignment with the note as reason and a full COACH history grant by default", async () => {
    const { db, request, assignments, grants, audits } = fixture();
    const result = await request.execute("user:opaque", "coach:opaque", { note: "Quero treinar para a maratona" });
    expect(result).toMatchObject({
      athleteId: "user:opaque", coachId: "coach:opaque", schoolId: null, isPrimary: true,
      status: "PENDING", startedAt: null, endedAt: null, assignedBy: null, reason: "Quero treinar para a maratona", createdAt: now,
    });
    expect(assignments).toEqual([result]);
    expect(db.coachAthleteAssignment.findFirst).toHaveBeenCalledWith({
      where: { athleteId: "user:opaque", coachId: "coach:opaque", schoolId: null, status: { in: ["PENDING", "ACTIVE"] } }, select: { id: true },
    });
    expect(grants[0]).toMatchObject({
      athleteId: "user:opaque", grantedBy: "user:opaque", granteeType: "COACH", granteeId: "coach:opaque",
      coachId: "coach:opaque", schoolId: null, scope: FULL_HISTORY_GRANT_SCOPE, status: "ACTIVE", grantedAt: now,
    });
    // Independent requests have no school to audit against.
    expect(audits).toHaveLength(0);
    expect(db.school.findUnique).not.toHaveBeenCalled();
  });

  it("creates no grant when the athlete opts out, and reuses an existing active COACH grant", async () => {
    const { db, request } = fixture();
    await request.execute("user:opaque", "coach:opaque", { shareHistory: false });
    expect(db.historyAccessGrant.findFirst).not.toHaveBeenCalled();
    expect(db.historyAccessGrant.create).not.toHaveBeenCalled();

    db.historyAccessGrant.findFirst.mockResolvedValue({ id: "grant:existing" });
    db.coachAthleteAssignment.findFirst.mockResolvedValue(null);
    await request.execute("user:other", "coach:opaque");
    expect(db.historyAccessGrant.create).not.toHaveBeenCalled();
  });

  it("refuses a duplicate independent request while one is open", async () => {
    const { db, request } = fixture();
    db.coachAthleteAssignment.findFirst.mockResolvedValue({ id: "open" });
    await expect(request.execute("user:opaque", "coach:opaque")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409 });
    expect(db.coachAthleteAssignment.create).not.toHaveBeenCalled();
    expect(db.historyAccessGrant.create).not.toHaveBeenCalled();
  });

  it.each([
    ["absent coach", { coach: null }, "COACH_PROFILE_NOT_FOUND", 404],
    ["inactive coach", { coach: { id: "coach:opaque", userId: "user:coach", status: "INACTIVE" } }, "COACH_INACTIVE", 409],
    ["self", { coach: { id: "coach:opaque", userId: "user:opaque", status: "ACTIVE" } }, "COACH_ATHLETE_ASSIGNMENT_SELF", 409],
  ] as const)("refuses %s", async (_label, overrides, code, status) => {
    const { db, request } = fixture();
    db.coachProfile.findUnique.mockResolvedValue(overrides.coach as never);
    await expect(request.execute("user:opaque", "coach:opaque")).rejects.toMatchObject({ code, status });
    expect(db.coachAthleteAssignment.create).not.toHaveBeenCalled();
  });

  it("within a school, requires both parties active there and no open primary coach, then audits in the school", async () => {
    const { db, request, audits } = fixture();
    db.schoolAthleteMembership.findFirst.mockResolvedValue(activeAthleteMembership());
    db.coachSchoolMembership.findFirst.mockResolvedValue(activeCoachLink());
    const result = await request.execute("user:opaque", "coach:opaque", { schoolId: "school:opaque" });
    expect(result).toMatchObject({ schoolId: "school:opaque", status: "PENDING", isPrimary: true });
    expect(db.coachAthleteAssignment.findFirst).toHaveBeenCalledWith({
      where: { athleteId: "user:opaque", schoolId: "school:opaque", isPrimary: true, status: { in: ["PENDING", "ACTIVE"] } }, select: { id: true },
    });
    expect(audits[0]).toMatchObject({
      schoolId: "school:opaque", actorUserId: "user:opaque", action: "coach_assignment.requested",
      entityType: "WorkoutAssignment", entityId: result.id, metadata: { athleteId: "user:opaque", coachId: "coach:opaque", shareHistory: true },
    });
  });

  it.each([
    ["athlete not a member", { athlete: null, coach: activeCoachLink() }, "ATHLETE_NOT_MEMBER", 403],
    ["coach not at the school", { athlete: activeAthleteMembership(), coach: null }, "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE", 409],
    ["coach suspended", { athlete: activeAthleteMembership(), coach: activeCoachLink(true) }, "COACH_SCHOOL_MEMBERSHIP_SUSPENDED", 409],
  ])("within a school, refuses when %s", async (_label, rows, code, status) => {
    const { db, request } = fixture();
    db.schoolAthleteMembership.findFirst.mockResolvedValue(rows.athlete as never);
    db.coachSchoolMembership.findFirst.mockResolvedValue(rows.coach as never);
    await expect(request.execute("user:opaque", "coach:opaque", { schoolId: "school:opaque" })).rejects.toMatchObject({ code, status });
    expect(db.coachAthleteAssignment.create).not.toHaveBeenCalled();
  });

  it("maps unique/serialization failures to a conflict and preserves other errors", async () => {
    const { db, request } = fixture();
    db.coachAthleteAssignment.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }));
    await expect(request.execute("user:opaque", "coach:opaque")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT", status: 409 });
    const error = new Error("storage unavailable");
    db.coachAthleteAssignment.create.mockRejectedValueOnce(error);
    await expect(request.execute("user:opaque", "coach:opaque")).rejects.toBe(error);
  });
});

describe("CancelCoachAssignmentRequest [SAM-25]", () => {
  function pendingRequest(overrides: Partial<Parameters<typeof createCoachAthleteAssignment>[0]> = {}) {
    return createCoachAthleteAssignment({
      id: "req:1", athleteId: "user:opaque", coachId: "coach:opaque", schoolId: null, isPrimary: true, sportType: null, ...overrides,
    }, earlier);
  }

  it("closes the athlete's own PENDING request as REJECTED by the athlete and revokes the COACH grant", async () => {
    const { db, cancel, assignments } = fixture();
    assignments.push(pendingRequest());
    const result = await cancel.execute("user:opaque", "coach:opaque", "req:1");
    expect(result).toMatchObject({ status: "REJECTED", endedAt: now, endedBy: "user:opaque", startedAt: null });
    expect(db.historyAccessGrant.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { athleteId: "user:opaque", coachId: "coach:opaque", granteeType: "COACH", status: "ACTIVE" },
      data: { status: "REVOKED", revokedBy: "user:opaque", revokedAt: now, updatedAt: now },
    });
  });

  it("keeps the grant when another open link with the same coach still exists, and audits school-scoped cancellations", async () => {
    const { db, cancel, assignments, audits } = fixture();
    assignments.push(pendingRequest({ schoolId: "school:opaque" }));
    db.coachAthleteAssignment.findFirst.mockResolvedValue({ id: "other-open" });
    await cancel.execute("user:opaque", "coach:opaque", "req:1");
    expect(db.historyAccessGrant.updateMany).not.toHaveBeenCalled();
    expect(audits[0]).toMatchObject({ schoolId: "school:opaque", action: "coach_assignment.request_cancelled", entityId: "req:1" });
  });

  it.each([
    ["another athlete's request", pendingRequest({ athleteId: "user:other" })],
    ["a request to another coach", pendingRequest({ coachId: "coach:other" })],
  ])("hides %s as 404 without touching it", async (_label, row) => {
    const { db, cancel, assignments } = fixture();
    assignments.push(row);
    await expect(cancel.execute("user:opaque", "coach:opaque", "req:1")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", status: 404 });
    expect(db.coachAthleteAssignment.update).not.toHaveBeenCalled();
  });

  it("refuses to cancel a request the coach already answered", async () => {
    const { db, cancel, assignments } = fixture();
    assignments.push(transitionCoachAthleteAssignment(pendingRequest(), "ACTIVE", earlier, "user:coach"));
    await expect(cancel.execute("user:opaque", "coach:opaque", "req:1")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION", status: 409 });
    expect(db.coachAthleteAssignment.update).not.toHaveBeenCalled();
    expect(db.historyAccessGrant.updateMany).not.toHaveBeenCalled();
  });
});
