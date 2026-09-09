import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { SchoolRole } from "@/modules/school/domain/enums";
import { createSchoolMembershipRole, schoolMembershipRoleSchema } from "@/modules/school/domain/school-membership-role";

const createdAt = new Date("2026-09-09T10:00:00Z");
const input = { id: "role-opaque", membershipId: "membership-opaque", role: SchoolRole.COACH };

describe("SchoolMembershipRole entity [T023]", () => {
  it.each(Object.values(SchoolRole))("creates and hydrates the school role %s", (role) => {
    const expected = { ...input, role, createdAt };
    expect(createSchoolMembershipRole({ ...input, role }, createdAt)).toEqual(expected);
    expect(schoolMembershipRoleSchema.parse(expected)).toEqual(expected);
  });

  it.each(["id", "membershipId"])("rejects invalid %s on creation and hydration", (field) => {
    for (const value of ["", " ", " padded ", null, 42]) {
      expect(() => createSchoolMembershipRole({ ...input, [field]: value }, createdAt)).toThrow(ZodError);
      expect(() => schoolMembershipRoleSchema.parse({ ...input, [field]: value, createdAt })).toThrow(ZodError);
    }
  });

  it.each(["USER", "SUPER_ADMIN", "coach", "", null, 42])("rejects invalid school role %s", (role) => {
    expect(() => createSchoolMembershipRole({ ...input, role: role as SchoolRole }, createdAt)).toThrow(ZodError);
    expect(() => schoolMembershipRoleSchema.parse({ ...input, role, createdAt })).toThrow(ZodError);
  });

  it("requires a valid Date without coercing persisted timestamps", () => {
    expect(() => createSchoolMembershipRole(input, new Date("invalid"))).toThrow(ZodError);
    for (const value of [new Date("invalid"), createdAt.toISOString(), null, undefined]) {
      expect(() => schoolMembershipRoleSchema.parse({ ...input, createdAt: value })).toThrow(ZodError);
    }
  });

  it("preserves the UTC instant and protects creation time from clock mutation", () => {
    const clock = new Date("2026-09-09T07:00:00-03:00");
    const assignment = createSchoolMembershipRole(input, clock);
    clock.setUTCFullYear(2000);
    expect(assignment.createdAt.toISOString()).toBe("2026-09-09T10:00:00.000Z");
  });

  it("rejects unrelated identity or permission fields", () => {
    expect(() => createSchoolMembershipRole({ ...input, userId: "user" } as typeof input, createdAt)).toThrow(ZodError);
    expect(() => schoolMembershipRoleSchema.parse({ ...input, createdAt, globalRole: "ADMIN" })).toThrow(ZodError);
  });
});
