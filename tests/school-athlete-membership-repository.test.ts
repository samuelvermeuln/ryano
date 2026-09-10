import { expect, it } from "vitest";
import { MembershipJoinSource, MembershipStatus } from "@/modules/school/domain/enums";
import { createSchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";
import { SchoolAthleteMembershipRepository } from "@/modules/school/infrastructure/school-athlete-membership-repository";

it("validates repository input before persistence [T048]", async () => {
  const repository = new SchoolAthleteMembershipRepository({
    schoolAthleteMembership: { create: async () => { throw new Error("unexpected"); }, findUnique: async () => null, findFirst: async () => null, findMany: async () => [], update: async () => { throw new Error("unexpected"); } },
  } as never);
  await expect(repository.findById(" bad ")).rejects.toThrow();
  const pending = createSchoolAthleteMembership({ id: "membership", schoolId: "school", athleteId: "athlete", joinSource: MembershipJoinSource.MANUAL_SEARCH }, new Date("2026-09-10T10:00:00Z"));
  expect(pending.status).toBe(MembershipStatus.PENDING);
  expect(await repository.findById("missing")).toBeNull();
});
