import { describe, expect, it, vi } from "vitest";
import { EvaluateExtraWorkout } from "@/modules/school/application/evaluate-extra-workout";

const mockRepo = () => ({
  createExtraAssignment: vi.fn(),
});

describe("EvaluateExtraWorkout", () => {
    it("creates an extra workout assignment for an unmatched activity", async () => {
        const repo = mockRepo();
        repo.createExtraAssignment.mockResolvedValue({ id: "extra-1" });
        const usecase = new EvaluateExtraWorkout(repo);
        const now = new Date("2025-01-01T10:00:00Z");

        const result = await usecase.execute({
            athleteId: "athlete-1",
            activityId: "activity-1",
        }, now);

        expect(result).toHaveProperty("id", "extra-1");
        expect(repo.createExtraAssignment).toHaveBeenCalledWith("athlete-1", "activity-1", now, undefined);
    });
});
