import { describe, expect, it } from "vitest";
import { createCoachSchoolMembership, transitionCoachSchoolMembership, type CoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership, type SchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";
import { MembershipStatus } from "@/modules/school/domain/enums";

// T059: execution, lint and type checking waived by the user for this environment.
const date = (day: number) => new Date(Date.UTC(2026, 8, day, 12));

describe("school membership temporal history [T059]", () => {
  it.each([MembershipStatus.ENDED, MembershipStatus.REVOKED])("preserves every athlete period across repeated returns after %s", (exitStatus) => {
    const history: SchoolAthleteMembership[] = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const previous = structuredClone(history);
      const requestedAt = date(cycle * 4 + 1);
      const approvedAt = date(cycle * 4 + 2);
      const endedAt = date(cycle * 4 + 3);
      const pending = createSchoolAthleteMembership({
        id: `athlete-period-${cycle}`, schoolId: "school", athleteId: "athlete",
        joinSource: cycle === 0 ? "SCHOOL_INVITE" : "MANUAL_SEARCH",
      }, requestedAt);
      expect(pending).toMatchObject({ status: "PENDING", startedAt: null, endedAt: null, approvedBy: null, approvedAt: null, revokedBy: null, revokedAt: null });
      const active = transitionSchoolAthleteMembership(pending, MembershipStatus.ACTIVE, approvedAt, `approver-${cycle}`);
      const closed = transitionSchoolAthleteMembership(active, exitStatus, endedAt, `remover-${cycle}`);
      expect(closed).toMatchObject({
        id: pending.id, athleteId: "athlete", schoolId: "school", status: exitStatus,
        createdAt: requestedAt, startedAt: approvedAt, approvedAt, approvedBy: `approver-${cycle}`,
        endedAt, updatedAt: endedAt,
        revokedBy: exitStatus === MembershipStatus.REVOKED ? `remover-${cycle}` : null,
        revokedAt: exitStatus === MembershipStatus.REVOKED ? endedAt : null,
      });
      expect(pending.status).toBe("PENDING");
      expect(active.endedAt).toBeNull();
      expect(history).toEqual(previous);
      history.push(closed);
    }
    expect(new Set(history.map((period) => period.id)).size).toBe(3);
    const snapshot = structuredClone(history);
    for (const period of history) {
      for (const status of [MembershipStatus.PENDING, MembershipStatus.ACTIVE]) {
        expect(() => transitionSchoolAthleteMembership(period, status, date(20), "approver"))
          .toThrow(expect.objectContaining({ code: "SCHOOL_ATHLETE_MEMBERSHIP_INVALID_TRANSITION" }));
      }
    }
    expect(history).toEqual(snapshot);
  });

  it.each([MembershipStatus.ENDED, MembershipStatus.REVOKED])("preserves every coach period across repeated returns after %s", (exitStatus) => {
    const history: CoachSchoolMembership[] = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const previous = structuredClone(history);
      const requestedAt = date(cycle * 4 + 1);
      const decidedAt = date(cycle * 4 + 2);
      const endedAt = date(cycle * 4 + 3);
      const pending = createCoachSchoolMembership({ id: `coach-period-${cycle}`, coachId: "coach", schoolId: "school" }, requestedAt);
      expect(pending).toMatchObject({ status: "PENDING", requestedAt, decidedAt: null, startedAt: null, endedAt: null });
      const active = transitionCoachSchoolMembership(pending, MembershipStatus.ACTIVE, decidedAt);
      const closed = transitionCoachSchoolMembership(active, exitStatus, endedAt);
      expect(closed).toMatchObject({
        id: pending.id, coachId: "coach", schoolId: "school", status: exitStatus,
        requestedAt, createdAt: requestedAt, decidedAt, startedAt: decidedAt, endedAt, updatedAt: endedAt,
      });
      expect(pending.status).toBe("PENDING");
      expect(active.endedAt).toBeNull();
      expect(history).toEqual(previous);
      history.push(closed);
    }
    expect(new Set(history.map((period) => period.id)).size).toBe(3);
    const snapshot = structuredClone(history);
    for (const period of history) {
      for (const status of [MembershipStatus.PENDING, MembershipStatus.ACTIVE]) {
        expect(() => transitionCoachSchoolMembership(period, status, date(20)))
          .toThrow(expect.objectContaining({ code: "COACH_SCHOOL_MEMBERSHIP_INVALID_TRANSITION" }));
      }
    }
    expect(history).toEqual(snapshot);
  });
});
