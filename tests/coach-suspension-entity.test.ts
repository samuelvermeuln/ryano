import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { MembershipStatus } from "@/modules/school/domain/enums";
import { SchoolError } from "@/modules/school/domain/errors";
import {
  coachSchoolMembershipSchema,
  createCoachSchoolMembership,
  resumeCoachSchoolMembership,
  suspendCoachSchoolMembership,
  transitionCoachSchoolMembership,
} from "@/modules/school/domain/coach-school-membership";

const now = new Date("2026-09-20T10:00:00Z");
const approved = new Date("2026-09-20T11:00:00Z");
const paused = new Date("2026-09-20T12:00:00Z");
const resumed = new Date("2026-09-20T13:00:00Z");
const input = { id: "period", coachId: "coach", schoolId: "school" };

const active = () => transitionCoachSchoolMembership(
  createCoachSchoolMembership(input, now), MembershipStatus.ACTIVE, approved,
);

describe("coach suspension is a per-school pause, not a removal", () => {
  it("keeps the link ACTIVE so athlete assignments and history survive", () => {
    const suspended = suspendCoachSchoolMembership(active(), "admin", paused);
    expect(suspended.status).toBe(MembershipStatus.ACTIVE);
    expect(suspended.suspendedAt).toEqual(paused);
    expect(suspended.suspendedBy).toBe("admin");
    // Ending the link is what closes a period; suspension must not do that.
    expect(suspended.endedAt).toBeNull();
    expect(suspended.startedAt).toEqual(approved);
  });

  it("reverses cleanly, clearing both suspension fields", () => {
    const back = resumeCoachSchoolMembership(suspendCoachSchoolMembership(active(), "admin", paused), resumed);
    expect(back.suspendedAt).toBeNull();
    expect(back.suspendedBy).toBeNull();
    expect(back.status).toBe(MembershipStatus.ACTIVE);
    expect(back.updatedAt).toEqual(resumed);
  });

  it("refuses to suspend twice or resume an active link", () => {
    const suspended = suspendCoachSchoolMembership(active(), "admin", paused);
    expect(() => suspendCoachSchoolMembership(suspended, "admin", resumed)).toThrow(SchoolError);
    expect(() => resumeCoachSchoolMembership(active(), resumed)).toThrow(SchoolError);
  });

  it("refuses to suspend a link that is not active", () => {
    const pending = createCoachSchoolMembership(input, now);
    expect(() => suspendCoachSchoolMembership(pending, "admin", paused)).toThrow(SchoolError);
    const ended = transitionCoachSchoolMembership(active(), MembershipStatus.ENDED, paused);
    expect(() => suspendCoachSchoolMembership(ended, "admin", resumed)).toThrow(SchoolError);
  });

  it("never lets time run backwards", () => {
    expect(() => suspendCoachSchoolMembership(active(), "admin", now)).toThrow(ZodError);
    const suspended = suspendCoachSchoolMembership(active(), "admin", paused);
    expect(() => resumeCoachSchoolMembership(suspended, approved)).toThrow(ZodError);
  });

  it("drops the suspension when the coach leaves the school", () => {
    const suspended = suspendCoachSchoolMembership(active(), "admin", paused);
    const ended = transitionCoachSchoolMembership(suspended, MembershipStatus.ENDED, resumed);
    // Only an ACTIVE row may carry suspension fields, so leaving absorbs it.
    expect(ended.suspendedAt).toBeNull();
    expect(ended.suspendedBy).toBeNull();
    expect(ended.endedAt).toEqual(resumed);
  });

  it("rejects a half-written suspension in either direction", () => {
    const base = suspendCoachSchoolMembership(active(), "admin", paused);
    expect(() => coachSchoolMembershipSchema.parse({ ...base, suspendedBy: null })).toThrow(ZodError);
    expect(() => coachSchoolMembershipSchema.parse({ ...base, suspendedAt: null })).toThrow(ZodError);
  });

  it("rejects a suspension stored on a closed period", () => {
    const ended = transitionCoachSchoolMembership(active(), MembershipStatus.ENDED, paused);
    expect(() => coachSchoolMembershipSchema.parse({
      ...ended, suspendedAt: paused, suspendedBy: "admin",
    })).toThrow(ZodError);
  });

  it("rejects a suspension dated before the period started", () => {
    expect(() => coachSchoolMembershipSchema.parse({
      ...active(), suspendedAt: now, suspendedBy: "admin", updatedAt: paused,
    })).toThrow(ZodError);
  });

  it("defaults existing rows without suspension columns to not suspended", () => {
    const { suspendedAt: _a, suspendedBy: _b, ...legacy } = active();
    expect(coachSchoolMembershipSchema.parse(legacy).suspendedAt).toBeNull();
  });
});
