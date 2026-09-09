import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { MembershipStatus } from "@/modules/school/domain/enums";
import { coachSchoolMembershipSchema, createCoachSchoolMembership, transitionCoachSchoolMembership } from "@/modules/school/domain/coach-school-membership";

const now = new Date("2026-09-09T10:00:00Z");
const decision = new Date("2026-09-09T11:00:00Z");
const end = new Date("2026-09-09T12:00:00Z");
const input = { id: "period-opaque", coachId: "coach-opaque", schoolId: "school-opaque" };
const pending = () => createCoachSchoolMembership(input, now);
const active = () => transitionCoachSchoolMembership(pending(), MembershipStatus.ACTIVE, decision);

describe("CoachSchoolMembership entity [T044]", () => {
  it("creates a pending request referencing the coach identity independently of users and roles", () => {
    expect(pending()).toEqual({ ...input, status: "PENDING", requestedAt: now, decidedAt: null, startedAt: null, endedAt: null, createdAt: now, updatedAt: now });
    expect(() => createCoachSchoolMembership({ ...input, userId: "user" } as typeof input, now)).toThrow(ZodError);
  });

  it.each(["id", "coachId", "schoolId"])("rejects empty and padded %s", (field) => {
    for (const value of ["", " ", " padded "]) {
      expect(() => createCoachSchoolMembership({ ...input, [field]: value }, now)).toThrow(ZodError);
    }
  });

  it("copies every date on creation and restoration", () => {
    const clock = new Date(now);
    const membership = createCoachSchoolMembership(input, clock);
    clock.setUTCFullYear(2000);
    expect(membership.requestedAt).toEqual(now);
    expect(membership.createdAt).not.toBe(membership.requestedAt);
    expect(membership.updatedAt).not.toBe(membership.createdAt);
    const closed = transitionCoachSchoolMembership(active(), MembershipStatus.ENDED, end);
    const restored = coachSchoolMembershipSchema.parse(closed);
    for (const field of ["requestedAt", "decidedAt", "startedAt", "endedAt", "createdAt", "updatedAt"] as const) {
      expect(restored[field]).toEqual(closed[field]);
      expect(restored[field]).not.toBe(closed[field]);
    }
  });

  it.each([
    { requestedAt: new Date("invalid") },
    { requestedAt: decision },
    { requestedAt: new Date("2026-09-08") },
    { decidedAt: now },
    { startedAt: now },
    { endedAt: now },
    { updatedAt: new Date("2026-09-08") },
    { status: "ACTIVE", startedAt: now },
    { status: "ACTIVE", decidedAt: now },
    { status: "ACTIVE", decidedAt: now, startedAt: now, endedAt: now },
    { status: "ACTIVE", decidedAt: decision, startedAt: now, updatedAt: decision },
    { status: "REJECTED", endedAt: now },
    { status: "REJECTED", decidedAt: now, startedAt: now, endedAt: now },
    { status: "REJECTED", decidedAt: decision, endedAt: now, updatedAt: decision },
    { status: "ENDED", decidedAt: now, endedAt: now },
    { status: "REVOKED", decidedAt: now, startedAt: now },
    { status: "ENDED", decidedAt: now, startedAt: now, endedAt: decision },
  ])("rejects inconsistent restored periods %j", (invalid) => {
    expect(() => coachSchoolMembershipSchema.parse({ ...pending(), ...invalid })).toThrow(ZodError);
  });

  it("approves without mutating the request", () => {
    const request = pending();
    expect(transitionCoachSchoolMembership(request, MembershipStatus.ACTIVE, decision)).toMatchObject({ status: "ACTIVE", requestedAt: now, decidedAt: decision, startedAt: decision, endedAt: null });
    expect(request).toEqual(pending());
  });

  it.each([MembershipStatus.ENDED, MembershipStatus.REVOKED])("preserves approval history when closing as %s", (status) => {
    const approved = active();
    const closed = transitionCoachSchoolMembership(approved, status, end);
    expect(closed).toMatchObject({ ...input, status, requestedAt: now, decidedAt: decision, startedAt: decision, endedAt: end, updatedAt: end });
    expect(approved).toEqual(active());
    expect(() => transitionCoachSchoolMembership(closed, MembershipStatus.ACTIVE, end)).toThrow(expect.objectContaining({ code: "COACH_SCHOOL_MEMBERSHIP_INVALID_TRANSITION", status: 409 }));
    expect(createCoachSchoolMembership({ ...input, id: "new-period" }, end)).toMatchObject({ status: "PENDING", startedAt: null });
  });

  it("rejects a request without an effective start and never reopens it", () => {
    const rejected = transitionCoachSchoolMembership(pending(), MembershipStatus.REJECTED, decision);
    expect(rejected).toMatchObject({ status: "REJECTED", decidedAt: decision, startedAt: null, endedAt: decision });
    expect(() => transitionCoachSchoolMembership(rejected, MembershipStatus.ACTIVE, end)).toThrow();
  });

  it("rejects invalid transitions and invalid or backward clocks", () => {
    expect(() => createCoachSchoolMembership(input, new Date("invalid"))).toThrow(ZodError);
    for (const status of [MembershipStatus.PENDING, MembershipStatus.ENDED, MembershipStatus.REVOKED]) {
      expect(() => transitionCoachSchoolMembership(pending(), status, decision)).toThrow();
    }
    expect(() => transitionCoachSchoolMembership(active(), MembershipStatus.REJECTED, end)).toThrow();
    expect(() => transitionCoachSchoolMembership(active(), MembershipStatus.ENDED, now)).toThrow(ZodError);
    expect(() => transitionCoachSchoolMembership(pending(), MembershipStatus.ACTIVE, new Date("invalid"))).toThrow(ZodError);
  });
});
