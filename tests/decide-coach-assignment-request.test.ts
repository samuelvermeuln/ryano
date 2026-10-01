import { describe, expect, it, vi } from "vitest";
import { DecideCoachAssignmentRequest } from "@/modules/school/application/decide-coach-assignment-request";
import { EndCoachAssignmentAsCoach } from "@/modules/school/application/end-coach-assignment-as-coach";
import { ListCoachAssignmentRequests } from "@/modules/school/application/list-coach-assignment-requests";
import { createCoachAthleteAssignment, transitionCoachAthleteAssignment, type CoachAthleteAssignment } from "@/modules/school/domain/coach-athlete-assignment";
import { createCoachSchoolMembership, transitionCoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";

const earlier = new Date("2026-09-01T12:00:00Z");
const now = new Date("2026-09-10T12:00:00Z");
type Row = Record<string, unknown>;

function fixture() {
  const assignments: CoachAthleteAssignment[] = [];
  const audits: Row[] = [];
  const db = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    coachProfile: { findUnique: vi.fn(async ({ where }: { where: { userId: string } }) =>
      where.userId === "user:coach" ? { id: "coach:opaque", userId: "user:coach", status: "ACTIVE" } : null) },
    coachAthleteAssignment: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => assignments.find((row) => row.id === where.id) ?? null),
      findFirst: vi.fn(async () => null as Row | null),
      findMany: vi.fn(async () => [] as Row[]),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<CoachAthleteAssignment> }) => {
        const index = assignments.findIndex((row) => row.id === where.id);
        assignments[index] = { ...assignments[index]!, ...data };
        return assignments[index];
      }),
    },
    coachSchoolMembership: { findFirst: vi.fn(async () => null as Row | null) },
    schoolAthleteMembership: { findFirst: vi.fn(async () => null as Row | null), findMany: vi.fn(async () => [] as Row[]) },
    historyAccessGrant: { updateMany: vi.fn(async () => ({ count: 1 })) },
    schoolAuditLog: { create: vi.fn(async ({ data }: { data: Row }) => { audits.push(data); return data; }) },
  };
  const clock = vi.fn(() => now);
  return {
    db, assignments, audits,
    decide: new DecideCoachAssignmentRequest(db as never, clock),
    end: new EndCoachAssignmentAsCoach(db as never, clock),
    list: new ListCoachAssignmentRequests(db as never),
  };
}

const pending = (overrides: Partial<Parameters<typeof createCoachAthleteAssignment>[0]> = {}) => createCoachAthleteAssignment({
  id: "req:1", athleteId: "user:athlete", coachId: "coach:opaque", schoolId: null, isPrimary: true, sportType: null, ...overrides,
}, earlier);
const activeCoachLink = () => transitionCoachSchoolMembership(
  createCoachSchoolMembership({ id: "link:1", coachId: "coach:opaque", schoolId: "school:1" }, earlier), "ACTIVE", earlier,
);
const activeAthleteMembership = () => transitionSchoolAthleteMembership(
  createSchoolAthleteMembership({ id: "m:1", schoolId: "school:1", athleteId: "user:athlete", joinSource: "MANUAL_SEARCH" }, earlier), "ACTIVE", earlier, "owner",
);

describe("DecideCoachAssignmentRequest [SAM-26]", () => {
  it("accepts an independent request: ACTIVE from now, assigned by the coach's own user", async () => {
    const { decide, assignments } = fixture();
    assignments.push(pending());
    const result = await decide.execute("user:coach", "req:1", "accept");
    expect(result).toMatchObject({ status: "ACTIVE", startedAt: now, endedAt: null, assignedBy: "user:coach" });
  });

  it("rejects a request and revokes the COACH grant when no other link with the athlete remains", async () => {
    const { decide, db, assignments } = fixture();
    assignments.push(pending());
    const result = await decide.execute("user:coach", "req:1", "reject");
    expect(result).toMatchObject({ status: "REJECTED", endedAt: now, endedBy: "user:coach", startedAt: null });
    expect(db.historyAccessGrant.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { athleteId: "user:athlete", coachId: "coach:opaque", granteeType: "COACH", status: "ACTIVE" },
      data: { status: "REVOKED", revokedBy: "user:coach", revokedAt: now, updatedAt: now },
    });
  });

  it("refuses users without a coach profile and hides requests addressed to another coach", async () => {
    const { decide, db, assignments } = fixture();
    assignments.push(pending({ coachId: "coach:other" }));
    await expect(decide.execute("user:athlete", "req:1", "accept")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(decide.execute("user:coach", "req:1", "accept")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", status: 404 });
    expect(db.coachAthleteAssignment.update).not.toHaveBeenCalled();
  });

  it("refuses to decide a request twice", async () => {
    const { decide, assignments } = fixture();
    assignments.push(transitionCoachAthleteAssignment(pending(), "ACTIVE", earlier, "user:coach"));
    await expect(decide.execute("user:coach", "req:1", "reject")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION", status: 409 });
  });

  it("within a school, waits for the athlete to be approved by the school before accepting", async () => {
    const { decide, db, assignments } = fixture();
    assignments.push(pending({ schoolId: "school:1" }));
    db.coachSchoolMembership.findFirst.mockResolvedValue(activeCoachLink());
    await expect(decide.execute("user:coach", "req:1", "accept")).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_NOT_ACTIVE", status: 409 });
    expect(db.coachAthleteAssignment.update).not.toHaveBeenCalled();
  });

  it("within a school, accepts once both are active and audits the decision in the school", async () => {
    const { decide, db, assignments, audits } = fixture();
    assignments.push(pending({ schoolId: "school:1" }));
    db.coachSchoolMembership.findFirst.mockResolvedValue(activeCoachLink());
    db.schoolAthleteMembership.findFirst.mockResolvedValue(activeAthleteMembership());
    const result = await decide.execute("user:coach", "req:1", "accept");
    expect(result.status).toBe("ACTIVE");
    expect(audits[0]).toMatchObject({ schoolId: "school:1", actorUserId: "user:coach", action: "coach_assignment.accepted", entityId: "req:1" });
  });
});

describe("ListCoachAssignmentRequests [SAM-26]", () => {
  it("returns nothing for users without a coach profile", async () => {
    const { list, db } = fixture();
    expect(await list.execute("user:athlete")).toEqual([]);
    expect(db.coachAthleteAssignment.findMany).not.toHaveBeenCalled();
  });

  it("marks school-scoped requests as blocked until the athlete is an active member", async () => {
    const { list, db } = fixture();
    db.coachAthleteAssignment.findMany.mockResolvedValue([
      { id: "a", schoolId: null, athleteId: "u1", reason: "Oi", createdAt: now, athlete: { id: "u1", name: "Ana", email: "a@x", image: null }, school: null },
      { id: "b", schoolId: "school:1", athleteId: "u2", reason: null, createdAt: now, athlete: { id: "u2", name: null, email: "b@x", image: null }, school: { name: "Alpha" } },
      { id: "c", schoolId: "school:1", athleteId: "u3", reason: null, createdAt: now, athlete: { id: "u3", name: "Caio", email: "c@x", image: null }, school: { name: "Alpha" } },
    ]);
    db.schoolAthleteMembership.findMany.mockResolvedValue([{ athleteId: "u3", schoolId: "school:1" }]);
    const rows = await list.execute("user:coach");
    expect(rows.map((row) => [row.id, row.canAccept, row.schoolName])).toEqual([["a", true, null], ["b", false, "Alpha"], ["c", true, "Alpha"]]);
    expect(rows[1]!.blockedReason).toMatch(/escola aprovar/);
    expect(db.coachAthleteAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { coachId: "coach:opaque", status: "PENDING" } }));
  });

  it("narrows to one school, or to independent requests with null", async () => {
    const { list, db } = fixture();
    await list.execute("user:coach", { schoolId: "school:1" });
    expect(db.coachAthleteAssignment.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { coachId: "coach:opaque", status: "PENDING", schoolId: "school:1" } }));
    await list.execute("user:coach", { schoolId: null });
    expect(db.coachAthleteAssignment.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { coachId: "coach:opaque", status: "PENDING", schoolId: null } }));
  });
});

describe("EndCoachAssignmentAsCoach [SAM-26]", () => {
  it("ends the coach's own independent ACTIVE link", async () => {
    const { end, assignments } = fixture();
    assignments.push(transitionCoachAthleteAssignment(pending(), "ACTIVE", earlier, "user:coach"));
    const result = await end.execute("user:coach", "req:1");
    expect(result).toMatchObject({ status: "ENDED", endedAt: now, endedBy: "user:coach" });
  });

  it("leaves school-scoped links to the school, refuses non-active links and hides other coaches' links", async () => {
    const { end, assignments } = fixture();
    assignments.push(
      transitionCoachAthleteAssignment(pending({ id: "school", schoolId: "school:1" }), "ACTIVE", earlier, "owner"),
      pending({ id: "pending" }),
      transitionCoachAthleteAssignment(pending({ id: "other", coachId: "coach:other" }), "ACTIVE", earlier, "x"),
    );
    await expect(end.execute("user:coach", "school")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(end.execute("user:coach", "pending")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION", status: 409 });
    await expect(end.execute("user:coach", "other")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", status: 404 });
  });
});
