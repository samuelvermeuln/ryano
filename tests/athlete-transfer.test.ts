import { describe, expect, it, vi } from "vitest";
import { ConfirmTransferToIndependent } from "@/modules/school/application/confirm-transfer-to-independent";
import { DecideCoachAssignmentRequest } from "@/modules/school/application/decide-coach-assignment-request";
import { GetCoachPublicProfile } from "@/modules/school/application/get-coach-public-profile";
import { ListCoachAssignmentRequests } from "@/modules/school/application/list-coach-assignment-requests";
import { ProposeAthleteTransfer } from "@/modules/school/application/propose-athlete-transfer";
import { MOVED_WITH_COACH_REASON } from "@/modules/school/application/approve-athlete-membership";
import {
  createCoachAthleteAssignment,
  MOVED_FROM_SCHOOL_REASON,
  transitionCoachAthleteAssignment,
  type CoachAthleteAssignment,
} from "@/modules/school/domain/coach-athlete-assignment";
import { createCoachSchoolMembership, transitionCoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";

/**
 * SAM-30 — transfers between independent coaching and a school.
 *
 * The coach only PROPOSES. Independent → school is a notification into the
 * SAM-29 "follow the coach" flow (the school still approves). School →
 * independent is a PENDING independent row the coach opens with
 * `reason = moved_from_school`; the athlete confirms it, which ends the pair's
 * school links and keeps the membership. The coach can never accept their own
 * proposal, and proposals never show up as "requests to decide".
 */
const earlier = new Date("2026-09-01T12:00:00Z");
const now = new Date("2026-10-01T12:00:00Z");
type Row = Record<string, unknown>;

const COACH = { id: "coach:opaque", userId: "user:coach", status: "ACTIVE", displayName: "Carlos Mendes", acceptsIndependentAthletes: true };
const SCHOOL = { id: "school:1", name: "Escola Alpha", status: "ACTIVE", joinPolicy: "REQUIRE_APPROVAL" };

function fixture(options: { coach?: Partial<typeof COACH>; school?: Partial<typeof SCHOOL> } = {}) {
  const coach = { ...COACH, ...options.coach };
  const school = { ...SCHOOL, ...options.school };
  const assignments: CoachAthleteAssignment[] = [];
  const audits: Row[] = [];
  const notifications: Row[] = [];
  const db = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    coachProfile: {
      findUnique: vi.fn(async ({ where }: { where: { userId?: string; id?: string } }) =>
        (where.userId === coach.userId || where.id === coach.id) ? { ...coach } : null),
    },
    school: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === school.id ? { ...school } : null)) },
    coachAthleteAssignment: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => assignments.find((row) => row.id === where.id) ?? null),
      // Answers by the shape of the query: independent (schoolId null) vs. a school's link.
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const statuses = typeof where.status === "string" ? [where.status] : ((where.status as { in: string[] })?.in ?? []);
        return assignments.find((row) =>
          row.athleteId === where.athleteId
          && row.coachId === where.coachId
          && (where.schoolId === undefined || row.schoolId === where.schoolId)
          && statuses.includes(row.status)
          && (where.reason === undefined || row.reason === where.reason)) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        assignments.filter((row) => row.athleteId === where.athleteId && row.coachId === where.coachId
          && row.schoolId !== null && row.status === where.status)),
      create: vi.fn(async ({ data }: { data: CoachAthleteAssignment }) => { assignments.push({ ...data }); return { ...data }; }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<CoachAthleteAssignment> }) => {
        const index = assignments.findIndex((row) => row.id === where.id);
        assignments[index] = { ...assignments[index]!, ...data };
        return assignments[index];
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => 0),
    },
    coachSchoolMembership: { findFirst: vi.fn(async () => null as Row | null) },
    schoolAthleteMembership: { findFirst: vi.fn(async () => null as Row | null), findMany: vi.fn(async () => [] as Row[]) },
    schoolMembership: { findMany: vi.fn(async () => [{ userId: "user:owner" }, { userId: "user:admin" }]) },
    user: { findUnique: vi.fn(async () => ({ name: "Samuel" })) },
    historyAccessGrant: { updateMany: vi.fn(async () => ({ count: 0 })) },
    userNotification: {
      create: vi.fn(async ({ data }: { data: Row }) => { notifications.push(data); return data; }),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => { notifications.push(...data); return { count: data.length }; }),
    },
    schoolAuditLog: { create: vi.fn(async ({ data }: { data: Row }) => { audits.push(data); return data; }) },
  };
  const clock = vi.fn(() => now);
  return {
    db, assignments, audits, notifications,
    propose: new ProposeAthleteTransfer(db as never, clock),
    confirm: new ConfirmTransferToIndependent(db as never, clock),
    decide: new DecideCoachAssignmentRequest(db as never, clock),
    list: new ListCoachAssignmentRequests(db as never),
    profile: new GetCoachPublicProfile(db as never),
  };
}

const activeLink = (overrides: Partial<Parameters<typeof createCoachAthleteAssignment>[0]> = {}) =>
  transitionCoachAthleteAssignment(createCoachAthleteAssignment({
    id: "link:independent", athleteId: "user:athlete", coachId: COACH.id, schoolId: null, isPrimary: true, sportType: null, ...overrides,
  }, earlier), "ACTIVE", earlier, COACH.userId);
const proposalRow = () => createCoachAthleteAssignment({
  id: "proposal:1", athleteId: "user:athlete", coachId: COACH.id, schoolId: null, isPrimary: true, sportType: null, reason: MOVED_FROM_SCHOOL_REASON,
}, earlier);
const activeCoachMembership = () => transitionCoachSchoolMembership(
  createCoachSchoolMembership({ id: "csm:1", coachId: COACH.id, schoolId: SCHOOL.id }, earlier), "ACTIVE", earlier,
);
const activeAthleteMembership = () => transitionSchoolAthleteMembership(
  createSchoolAthleteMembership({ id: "sam:1", schoolId: SCHOOL.id, athleteId: "user:athlete", joinSource: "MANUAL_SEARCH" }, earlier), "ACTIVE", earlier, "owner",
);

describe("ProposeAthleteTransfer — independent → school", () => {
  const input = { kind: "to-school", athleteId: "user:athlete", schoolId: SCHOOL.id } as const;

  it("notifies the athlete with the SAM-29 follow-the-coach link and persists nothing", async () => {
    const { propose, db, assignments, notifications, audits } = fixture();
    assignments.push(activeLink());
    db.coachSchoolMembership.findFirst.mockResolvedValue(activeCoachMembership());

    const result = await propose.execute(COACH.userId, input);

    expect(result).toEqual({ target: "school", schoolId: SCHOOL.id });
    expect(db.coachAthleteAssignment.create).not.toHaveBeenCalled();
    expect(notifications[0]).toMatchObject({
      userId: "user:athlete", kind: "COACH_TRANSFER_PROPOSED", href: `/app/escola?school=${SCHOOL.id}&coach=${COACH.id}`,
    });
    expect(audits[0]).toMatchObject({ schoolId: SCHOOL.id, action: "athlete_transfer.proposed", entityId: "link:independent" });
  });

  it("refuses when the pair has no ACTIVE independent link", async () => {
    const { propose, db } = fixture();
    db.coachSchoolMembership.findFirst.mockResolvedValue(activeCoachMembership());
    await expect(propose.execute(COACH.userId, input)).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", status: 404 });
  });

  it("refuses an invite-only school, a school the coach is not active in, and an athlete already there", async () => {
    const inviteOnly = fixture({ school: { joinPolicy: "INVITE_ONLY" } });
    inviteOnly.assignments.push(activeLink());
    await expect(inviteOnly.propose.execute(COACH.userId, input)).rejects.toMatchObject({ code: "SCHOOL_INVITE_ONLY" });

    const notMember = fixture();
    notMember.assignments.push(activeLink());
    await expect(notMember.propose.execute(COACH.userId, input)).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE" });

    const alreadyThere = fixture();
    alreadyThere.assignments.push(activeLink());
    alreadyThere.db.coachSchoolMembership.findFirst.mockResolvedValue(activeCoachMembership());
    alreadyThere.db.schoolAthleteMembership.findFirst.mockResolvedValue({ status: "ACTIVE" });
    await expect(alreadyThere.propose.execute(COACH.userId, input)).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_ACTIVE" });
    alreadyThere.db.schoolAthleteMembership.findFirst.mockResolvedValue({ status: "PENDING" });
    await expect(alreadyThere.propose.execute(COACH.userId, input)).rejects.toMatchObject({ code: "SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_PENDING" });
    expect(alreadyThere.notifications).toHaveLength(0);
  });

  it("refuses a non-coach actor", async () => {
    const { propose } = fixture();
    await expect(propose.execute("user:athlete", input)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});

describe("ProposeAthleteTransfer — school → independent", () => {
  const input = { kind: "to-independent", athleteId: "user:athlete", schoolId: SCHOOL.id } as const;

  it("opens a PENDING independent row with reason moved_from_school and notifies the athlete", async () => {
    const { propose, assignments, notifications, audits } = fixture();
    assignments.push(activeLink({ id: "link:school", schoolId: SCHOOL.id }));

    const result = await propose.execute(COACH.userId, input);

    expect(result).toMatchObject({ target: "independent" });
    const proposal = assignments.find((row) => row.schoolId === null)!;
    expect(proposal).toMatchObject({ status: "PENDING", reason: MOVED_FROM_SCHOOL_REASON, coachId: COACH.id, isPrimary: true, startedAt: null });
    expect(notifications[0]).toMatchObject({ userId: "user:athlete", kind: "COACH_TRANSFER_PROPOSED", href: `/app/professor?professor=${COACH.id}` });
    expect(audits[0]).toMatchObject({ schoolId: SCHOOL.id, action: "athlete_transfer.proposed", entityId: proposal.id });
  });

  it("refuses when the coach does not take independent athletes, has no link at that school, or the pair is already open independently", async () => {
    const closed = fixture({ coach: { acceptsIndependentAthletes: false } });
    closed.assignments.push(activeLink({ id: "link:school", schoolId: SCHOOL.id }));
    await expect(closed.propose.execute(COACH.userId, input)).rejects.toMatchObject({ code: "COACH_NOT_ACCEPTING_INDEPENDENT" });

    const noLink = fixture();
    await expect(noLink.propose.execute(COACH.userId, input)).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_NOT_FOUND" });

    const alreadyOpen = fixture();
    alreadyOpen.assignments.push(activeLink({ id: "link:school", schoolId: SCHOOL.id }), proposalRow());
    await expect(alreadyOpen.propose.execute(COACH.userId, input)).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_CONFLICT" });
    expect(alreadyOpen.db.coachAthleteAssignment.create).not.toHaveBeenCalled();
  });
});

describe("ConfirmTransferToIndependent — the athlete decides", () => {
  it("activates the proposal, ends the pair's school link, audits and notifies managers and coach; membership and grants untouched", async () => {
    const { confirm, db, assignments, audits, notifications } = fixture();
    assignments.push(activeLink({ id: "link:school", schoolId: SCHOOL.id }), proposalRow());

    const result = await confirm.execute("user:athlete", COACH.id, "proposal:1");

    expect(result).toMatchObject({ id: "proposal:1", status: "ACTIVE", startedAt: now, assignedBy: "user:athlete" });
    expect(assignments.find((row) => row.id === "link:school")).toMatchObject({ status: "ENDED", endedAt: now, endedBy: "user:athlete" });
    expect(audits[0]).toMatchObject({ schoolId: SCHOOL.id, action: "athlete_transfer.confirmed", entityId: "link:school" });
    expect(db.userNotification.createMany).toHaveBeenCalledOnce();
    expect(notifications.filter((row) => row.kind === "COACH_TRANSFER_CONFIRMED").map((row) => row.userId).sort())
      .toEqual(["user:admin", "user:coach", "user:owner"]);
    expect(notifications.find((row) => row.userId === "user:coach")).toMatchObject({ href: "/professor/independente/atletas/user:athlete" });
    // The athlete stays in the school and keeps their consent as it was.
    expect(db.schoolAthleteMembership.findFirst).not.toHaveBeenCalled();
    expect(db.historyAccessGrant.updateMany).not.toHaveBeenCalled();
  });

  it("hides someone else's proposal and refuses rows that are not a transfer proposal or were already decided", async () => {
    const { confirm, assignments, db } = fixture();
    assignments.push(proposalRow());
    await expect(confirm.execute("user:other", COACH.id, "proposal:1")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_NOT_FOUND", status: 404 });
    await expect(confirm.execute("user:athlete", "coach:other", "proposal:1")).rejects.toMatchObject({ status: 404 });

    const plainRequest = fixture();
    plainRequest.assignments.push(createCoachAthleteAssignment({
      id: "req:1", athleteId: "user:athlete", coachId: COACH.id, schoolId: null, isPrimary: true, sportType: null,
    }, earlier));
    await expect(plainRequest.confirm.execute("user:athlete", COACH.id, "req:1")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION" });

    const decided = fixture();
    decided.assignments.push(transitionCoachAthleteAssignment(proposalRow(), "ACTIVE", earlier, "user:athlete"));
    await expect(decided.confirm.execute("user:athlete", COACH.id, "proposal:1")).rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION" });
    expect(db.coachAthleteAssignment.update).not.toHaveBeenCalled();
  });

  it("refuses once the coach stopped taking independent athletes", async () => {
    const { confirm, assignments } = fixture({ coach: { acceptsIndependentAthletes: false } });
    assignments.push(proposalRow());
    await expect(confirm.execute("user:athlete", COACH.id, "proposal:1")).rejects.toMatchObject({ code: "COACH_NOT_ACCEPTING_INDEPENDENT" });
  });
});

describe("DecideCoachAssignmentRequest — SAM-30 guards", () => {
  it("refuses the coach accepting their own transfer proposal", async () => {
    const { decide, assignments, db } = fixture();
    assignments.push(proposalRow());
    await expect(decide.execute(COACH.userId, "proposal:1", "accept"))
      .rejects.toMatchObject({ code: "COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION", status: 409 });
    expect(db.coachAthleteAssignment.update).not.toHaveBeenCalled();
  });

  it("closes the SAM-29 gap: accepting a moved_with_coach school request ends the pair's other links", async () => {
    const { decide, assignments, db } = fixture();
    assignments.push(createCoachAthleteAssignment({
      id: "req:school", athleteId: "user:athlete", coachId: COACH.id, schoolId: SCHOOL.id, isPrimary: true, sportType: null, reason: MOVED_WITH_COACH_REASON,
    }, earlier));
    db.coachSchoolMembership.findFirst.mockResolvedValue(activeCoachMembership());
    db.schoolAthleteMembership.findFirst.mockResolvedValue(activeAthleteMembership());

    const result = await decide.execute(COACH.userId, "req:school", "accept");

    expect(result.status).toBe("ACTIVE");
    expect(db.coachAthleteAssignment.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { athleteId: "user:athlete", coachId: COACH.id, status: "ACTIVE", OR: [{ schoolId: null }, { schoolId: { not: SCHOOL.id } }] },
      data: { status: "ENDED", endedAt: now, endedBy: "user:athlete", updatedAt: now },
    });
  });

  it("does not touch other links when the school request carries no transfer reason", async () => {
    const { decide, assignments, db } = fixture();
    assignments.push(createCoachAthleteAssignment({
      id: "req:plain", athleteId: "user:athlete", coachId: COACH.id, schoolId: SCHOOL.id, isPrimary: true, sportType: null,
    }, earlier));
    db.coachSchoolMembership.findFirst.mockResolvedValue(activeCoachMembership());
    db.schoolAthleteMembership.findFirst.mockResolvedValue(activeAthleteMembership());

    await decide.execute(COACH.userId, "req:plain", "accept");

    expect(db.coachAthleteAssignment.updateMany).not.toHaveBeenCalled();
  });
});

describe("Proposals never read as requests to decide", () => {
  it("ListCoachAssignmentRequests leaves the coach's own proposals out", async () => {
    const { list, db } = fixture();
    db.coachAthleteAssignment.findMany.mockResolvedValue([
      { id: "req", schoolId: null, athleteId: "u1", reason: "Oi", createdAt: now, athlete: { id: "u1", name: "Ana", email: "a@x", image: null }, school: null },
      { id: "proposal", schoolId: null, athleteId: "u2", reason: MOVED_FROM_SCHOOL_REASON, createdAt: now, athlete: { id: "u2", name: "Bia", email: "b@x", image: null }, school: null },
    ]);
    const rows = await list.execute(COACH.userId);
    expect(rows.map((row) => row.id)).toEqual(["req"]);
  });

  it("GetCoachPublicProfile tells the athlete which PENDING row is a proposal", async () => {
    const { profile, db } = fixture();
    db.coachProfile.findUnique.mockResolvedValue({
      ...COACH, bio: null, createdAt: earlier, sportTypes: [], credentials: [], user: { image: null }, schoolMemberships: [],
    });
    db.coachAthleteAssignment.findMany.mockResolvedValue([
      { id: "proposal:1", schoolId: null, status: "PENDING", reason: MOVED_FROM_SCHOOL_REASON, createdAt: now },
      { id: "req:1", schoolId: SCHOOL.id, status: "PENDING", reason: "Oi", createdAt: now },
    ]);
    const view = await profile.execute("user:athlete", COACH.id);
    expect(view.viewer.assignments.map((row) => [row.id, row.kind])).toEqual([["proposal:1", "proposal"], ["req:1", "request"]]);
  });
});
