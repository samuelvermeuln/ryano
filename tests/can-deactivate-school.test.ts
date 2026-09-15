import { describe, expect, it, vi } from "vitest";
import { CanDeactivateSchool } from "@/modules/school/application/can-deactivate-school";
import { MembershipStatus, SchoolRole } from "@/modules/school/domain/enums";

const now = new Date("2026-09-14T12:00:00Z");
const membership = {
  id: "membership", schoolId: "school", userId: "actor",
  status: MembershipStatus.ACTIVE, startedAt: now, endedAt: null,
  createdAt: now, updatedAt: now,
};

function setup(roles: SchoolRole[] = [SchoolRole.OWNER]) {
  const repository = {
    findActiveBySchoolAndUser: vi.fn().mockResolvedValue({ ...membership }),
    findRoles: vi.fn().mockResolvedValue(roles.map((role) => ({
      id: `role-${role}`, membershipId: membership.id, role, createdAt: now,
    }))),
  };
  return { repository, policy: new CanDeactivateSchool(repository) };
}

describe("CanDeactivateSchool [T033]", () => {
  it("allows an active local OWNER and queries the requested actor and school", async () => {
    const { policy, repository } = setup();
    await expect(policy.execute("actor", "school")).resolves.toBe(true);
    await expect(policy.assert("actor", "school")).resolves.toBeUndefined();
    expect(repository.findActiveBySchoolAndUser).toHaveBeenCalledWith("school", "actor");
    expect(repository.findRoles).toHaveBeenCalledWith("membership");
  });

  it.each([SchoolRole.ADMIN, SchoolRole.COACH, SchoolRole.ASSISTANT_COACH,
    SchoolRole.STAFF, SchoolRole.ATHLETE, SchoolRole.GUARDIAN])("denies %s without OWNER", async (role) => {
    const { policy } = setup([role]);
    await expect(policy.execute("actor", "school")).resolves.toBe(false);
    await expect(policy.assert("actor", "school")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("allows combined roles but revokes permission when OWNER is removed even if ADMIN remains", async () => {
    const { policy, repository } = setup([SchoolRole.OWNER, SchoolRole.ADMIN, SchoolRole.COACH]);
    await expect(policy.execute("actor", "school")).resolves.toBe(true);
    repository.findRoles.mockResolvedValue([{
      id: "admin-role", membershipId: membership.id, role: SchoolRole.ADMIN, createdAt: now,
    }]);
    await expect(policy.execute("actor", "school")).resolves.toBe(false);
    await expect(policy.assert("actor", "school")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("denies a member without roles", async () => {
    const { policy } = setup([]);
    await expect(policy.execute("actor", "school")).resolves.toBe(false);
  });

  it("denies absent local membership, including global administrators and bare owners", async () => {
    const { policy, repository } = setup();
    repository.findActiveBySchoolAndUser.mockResolvedValue(null);
    await expect(policy.execute("actor", "school")).resolves.toBe(false);
    expect(repository.findRoles).not.toHaveBeenCalled();
  });

  it.each([MembershipStatus.PENDING, MembershipStatus.REJECTED, MembershipStatus.REVOKED,
    MembershipStatus.ENDED])("denies a %s OWNER period", async (status) => {
    const { policy, repository } = setup();
    repository.findActiveBySchoolAndUser.mockResolvedValue({ ...membership, status });
    await expect(policy.execute("actor", "school")).resolves.toBe(false);
    expect(repository.findRoles).not.toHaveBeenCalled();
  });

  it.each([{ endedAt: now }, { schoolId: "another-school" }, { userId: "another-user" }])(
    "rejects ended or mismatched periods: %j", async (change) => {
      const { policy, repository } = setup();
      repository.findActiveBySchoolAndUser.mockResolvedValue({ ...membership, ...change });
      await expect(policy.execute("actor", "school")).resolves.toBe(false);
      expect(repository.findRoles).not.toHaveBeenCalled();
    },
  );

  it("does not combine a local ADMIN with another membership's OWNER", async () => {
    const { policy, repository } = setup();
    repository.findRoles.mockResolvedValue([
      { id: "foreign-owner", membershipId: "another-membership", role: SchoolRole.OWNER, createdAt: now },
      { id: "local-admin", membershipId: membership.id, role: SchoolRole.ADMIN, createdAt: now },
    ]);
    await expect(policy.execute("actor", "school")).resolves.toBe(false);
  });

  it.each([null, "", " actor", "actor ", "a".repeat(257)])("rejects invalid actor %j before reads", async (actor) => {
    const { policy, repository } = setup();
    await expect(policy.execute(actor, "school")).resolves.toBe(false);
    await expect(policy.assert(actor, "school")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(repository.findActiveBySchoolAndUser).not.toHaveBeenCalled();
    expect(repository.findRoles).not.toHaveBeenCalled();
  });

  it.each(["", " school", "school ", "s".repeat(257)])("rejects invalid school %j before reads", async (school) => {
    const { policy, repository } = setup();
    await expect(policy.execute("actor", school)).resolves.toBe(false);
    await expect(policy.assert("actor", school)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(repository.findActiveBySchoolAndUser).not.toHaveBeenCalled();
  });

  it.each(["findActiveBySchoolAndUser", "findRoles"] as const)("propagates %s failures without granting access", async (method) => {
    const { policy, repository } = setup();
    const error = new Error("Storage unavailable");
    repository[method].mockRejectedValue(error);
    await expect(policy.execute("actor", "school")).rejects.toBe(error);
    await expect(policy.assert("actor", "school")).rejects.toBe(error);
  });
});
