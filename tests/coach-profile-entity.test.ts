import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { CoachStatus, coachProfileSchema, createCoachProfile } from "@/modules/school";

const now = new Date("2026-09-09T10:00:00Z");
const input = { id: "coach-opaque", userId: "user-opaque", displayName: "Coach" };

describe("CoachProfile independent entity [T041]", () => {
  it("creates an active profile without requiring a school or athlete identity", () => {
    expect(createCoachProfile(input, now)).toEqual({ ...input, bio: null, status: CoachStatus.ACTIVE, createdAt: now, updatedAt: now });
    expect(createCoachProfile({ ...input, bio: "Swimming coach" }, now).bio).toBe("Swimming coach");
  });

  it.each(["id", "userId"])("rejects empty or padded %s without rewriting it", (field) => {
    for (const value of ["", " ", " padded "]) {
      expect(() => createCoachProfile({ ...input, [field]: value }, now)).toThrow(ZodError);
    }
  });

  it("requires a meaningful display name", () => {
    for (const displayName of ["", "   "]) {
      expect(() => createCoachProfile({ ...input, displayName }, now)).toThrow(ZodError);
    }
  });

  it("rejects invalid clocks and copies timestamps independently", () => {
    expect(() => createCoachProfile(input, new Date("invalid"))).toThrow(ZodError);
    const clock = new Date(now);
    const profile = createCoachProfile(input, clock);
    clock.setUTCFullYear(2000);
    expect(profile.createdAt).toEqual(now);
    expect(profile.updatedAt).toEqual(now);
    expect(profile.createdAt).not.toBe(profile.updatedAt);
  });

  it("validates persisted statuses, bio and chronology", () => {
    const profile = createCoachProfile(input, now);
    for (const status of Object.values(CoachStatus)) {
      expect(coachProfileSchema.parse({ ...profile, status }).status).toBe(status);
    }
    for (const invalid of [
      { status: "ARCHIVED" }, { bio: 123 }, { createdAt: new Date("invalid") },
      { updatedAt: new Date("2026-09-08") }, { updatedAt: now.toISOString() },
    ]) {
      expect(() => coachProfileSchema.parse({ ...profile, ...invalid })).toThrow(ZodError);
    }
  });
});
