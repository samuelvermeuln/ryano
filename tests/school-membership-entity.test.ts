import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { MembershipStatus } from "@/modules/school/domain/enums";
import { createSchoolMembership, schoolMembershipSchema, transitionSchoolMembership } from "@/modules/school/domain/school-membership";

const createdAt = new Date("2026-09-09T10:00:00Z");
const later = new Date("2026-09-09T11:00:00Z");
const input = { id: "membership-opaque", schoolId: "school-opaque", userId: "user-opaque" };
const pending = () => createSchoolMembership(input, createdAt);

describe("SchoolMembership temporal entity [T021]", () => {
  it("creates a pending period without starting access and preserves opaque IDs", () => {
    expect(pending()).toEqual({ ...input, status: "PENDING", startedAt: null, endedAt: null, createdAt, updatedAt: createdAt });
  });

  it.each(["id", "schoolId", "userId"])("rejects empty or padded %s", (field) => {
    for (const value of ["", " ", " padded "]) {
      expect(() => createSchoolMembership({ ...input, [field]: value }, createdAt)).toThrow(ZodError);
    }
  });

  it("rejects invalid clocks and does not retain input Date references", () => {
    expect(() => createSchoolMembership(input, new Date("invalid"))).toThrow(ZodError);
    const clock = new Date(createdAt);
    const membership = createSchoolMembership(input, clock);
    clock.setUTCFullYear(2000);
    expect(membership.createdAt).toEqual(createdAt);
    expect(membership.updatedAt).not.toBe(membership.createdAt);
  });

  it.each([
    { startedAt: createdAt },
    { endedAt: later },
    { status: "ACTIVE" },
    { status: "ACTIVE", startedAt: createdAt, endedAt: later },
    { status: "ENDED" },
    { status: "REJECTED", startedAt: createdAt, endedAt: createdAt },
    { status: "REVOKED", endedAt: createdAt },
    { status: "ACTIVE", startedAt: new Date("2026-09-08") },
    { updatedAt: new Date("2026-09-08") },
    { status: "ENDED", startedAt: later, endedAt: createdAt, updatedAt: later },
    { status: "ENDED", startedAt: createdAt, endedAt: later },
  ])("rejects inconsistent persisted periods %j", (invalid) => {
    expect(() => schoolMembershipSchema.parse({ ...pending(), ...invalid })).toThrow(ZodError);
  });

  it("approves at the effective instant without mutating the pending record", () => {
    const before = pending();
    const active = transitionSchoolMembership(before, MembershipStatus.ACTIVE, later);
    expect(active).toMatchObject({ status: "ACTIVE", startedAt: later, endedAt: null, updatedAt: later });
    expect(before).toEqual(pending());
    expect(active.createdAt).not.toBe(before.createdAt);
  });

  it.each([MembershipStatus.ENDED, MembershipStatus.REVOKED])("closes an active period as %s and prevents reopening", (status) => {
    const active = transitionSchoolMembership(pending(), MembershipStatus.ACTIVE, createdAt);
    const closed = transitionSchoolMembership(active, status, later);
    expect(closed).toMatchObject({ status, startedAt: createdAt, endedAt: later });
    expect(() => transitionSchoolMembership(closed, MembershipStatus.ACTIVE, later)).toThrow(expect.objectContaining({ code: "SCHOOL_MEMBERSHIP_INVALID_TRANSITION" }));
    const returned = createSchoolMembership({ ...input, id: "new-period" }, later);
    expect(returned.id).not.toBe(closed.id);
    expect(returned.startedAt).toBeNull();
  });

  it("rejects a pending request without inventing an effective start", () => {
    const rejected = transitionSchoolMembership(pending(), MembershipStatus.REJECTED, later);
    expect(rejected).toMatchObject({ status: "REJECTED", startedAt: null, endedAt: later });
    expect(() => transitionSchoolMembership(rejected, MembershipStatus.ACTIVE, later)).toThrow();
  });

  it("rejects invalid transitions and backward or invalid clocks", () => {
    expect(() => transitionSchoolMembership(pending(), MembershipStatus.ENDED, later)).toThrow();
    expect(() => transitionSchoolMembership(pending(), MembershipStatus.PENDING, later)).toThrow();
    expect(() => transitionSchoolMembership(pending(), MembershipStatus.ACTIVE, new Date("invalid"))).toThrow(ZodError);
    expect(() => transitionSchoolMembership(pending(), MembershipStatus.ACTIVE, new Date("2026-09-08"))).toThrow(ZodError);
    const active = transitionSchoolMembership(pending(), MembershipStatus.ACTIVE, later);
    expect(() => transitionSchoolMembership(active, MembershipStatus.REJECTED, later)).toThrow();
    expect(() => transitionSchoolMembership(active, MembershipStatus.ENDED, createdAt)).toThrow(ZodError);
  });
});
