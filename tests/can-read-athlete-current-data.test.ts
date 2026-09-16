import { describe, expect, it, vi } from "vitest";
import { CanReadAthleteCurrentData } from "@/modules/athlete-history";

function database({ membership = null, assignment = null } = {}) {
  const schoolMembership = { findFirst: vi.fn().mockResolvedValue(membership) };
  const coachAthleteAssignment = { findFirst: vi.fn().mockResolvedValue(assignment) };
  return { db: { schoolMembership, coachAthleteAssignment }, schoolMembership, coachAthleteAssignment };
}

describe("CanReadAthleteCurrentData [T108]", () => {
  it("allows the athlete without querying school context", async () => {
    const { db, schoolMembership, coachAthleteAssignment } = database();
    await expect(new CanReadAthleteCurrentData(db as never).execute("athlete-1", "athlete-1", "school-1")).resolves.toBe(true);
    expect(schoolMembership.findFirst).not.toHaveBeenCalled();
    expect(coachAthleteAssignment.findFirst).not.toHaveBeenCalled();
  });

  it("allows an active local owner or admin", async () => {
    const { db, schoolMembership, coachAthleteAssignment } = database({ membership: { id: "member-1" } });
    await expect(new CanReadAthleteCurrentData(db as never).execute("admin-1", "athlete-1", "school-1")).resolves.toBe(true);
    expect(schoolMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ schoolId: "school-1", userId: "admin-1", status: "ACTIVE", endedAt: null }),
    }));
    expect(coachAthleteAssignment.findFirst).not.toHaveBeenCalled();
  });

  it("allows only the coach with an active open assignment in the same school", async () => {
    const { db, coachAthleteAssignment } = database({ assignment: { id: "assignment-1" } });
    await expect(new CanReadAthleteCurrentData(db as never).execute("coach-user-1", "athlete-1", "school-1")).resolves.toBe(true);
    expect(coachAthleteAssignment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ athleteId: "athlete-1", schoolId: "school-1", status: "ACTIVE", endedAt: null }),
    }));
  });

  it("denies unrelated, ended, and malformed access attempts", async () => {
    const { db, schoolMembership, coachAthleteAssignment } = database();
    const policy = new CanReadAthleteCurrentData(db as never);
    await expect(policy.execute("other-user", "athlete-1", "school-1")).resolves.toBe(false);
    await expect(policy.execute(" other-user", "athlete-1", "school-1")).resolves.toBe(false);
    expect(schoolMembership.findFirst).toHaveBeenCalledTimes(1);
    expect(coachAthleteAssignment.findFirst).toHaveBeenCalledTimes(1);
  });
});
