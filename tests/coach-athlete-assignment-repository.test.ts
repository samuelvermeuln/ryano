import { expect, it } from "vitest";
import { createCoachAthleteAssignment } from "@/modules/school/domain/coach-athlete-assignment";
import { CoachAthleteAssignmentRepository } from "@/modules/school/infrastructure/coach-athlete-assignment-repository";

it("validates assignment repository scope input before persistence [T062]", async () => {
  const repository = new CoachAthleteAssignmentRepository({
    coachAthleteAssignment: { create: async () => { throw new Error("unexpected"); }, findUnique: async () => null, findFirst: async () => null, findMany: async () => [], update: async () => { throw new Error("unexpected"); } },
  } as never);
  const assignment = createCoachAthleteAssignment({ id: "assignment", schoolId: "school", athleteId: "athlete", coachId: "coach", isPrimary: true, sportType: null }, new Date("2026-09-11T10:00:00Z"));
  expect(assignment.status).toBe("PENDING");
  await expect(repository.findById(" bad ")).rejects.toThrow();
  await expect(repository.listBySchool("school", { limit: 101 })).rejects.toThrow();
  expect(await repository.findActivePrimaryBySchoolAndAthlete("school", "athlete")).toBeNull();
});
