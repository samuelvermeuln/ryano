import { describe, expect, it, vi } from "vitest";
import { EvaluateExtraWorkout, ExtraWorkoutRecord } from "@/modules/school/application/evaluate-extra-workout";

const mockRepo = () => ({
  createExtraAssignment: vi.fn(),
});

describe("EvaluateExtraWorkout", () => {
  it("creates an extra workout assignment for an unmatched activity", async () => {
    const repo = mockRepo();
    const now = new Date("2025-01-01T10:00:00Z");
    const mockRecord: ExtraWorkoutRecord = {
      id: "extra-1",
      athleteId: "athlete-1",
      activityId: "activity-1",
      status: "UNPLANNED",
      createdAt: now,
    };
    repo.createExtraAssignment.mockResolvedValue(mockRecord);
    const usecase = new EvaluateExtraWorkout(repo);

    const result = await usecase.execute({ athleteId: "athlete-1", activityId: "activity-1" }, now);

    expect(result.id).toBe("extra-1");
    expect(result.status).toBe("UNPLANNED");
    expect(repo.createExtraAssignment).toHaveBeenCalledWith("athlete-1", "activity-1", now, undefined);
  });

  it("forwards optional metadata to the repository", async () => {
    const repo = mockRepo();
    const now = new Date("2025-06-01T08:00:00Z");
    const meta = { source: "watch-sync" };
    const mockRecord: ExtraWorkoutRecord = {
      id: "extra-2",
      athleteId: "athlete-2",
      activityId: "activity-2",
      status: "UNPLANNED",
      createdAt: now,
      metadata: meta,
    };
    repo.createExtraAssignment.mockResolvedValue(mockRecord);
    const usecase = new EvaluateExtraWorkout(repo);

    const result = await usecase.execute({ athleteId: "athlete-2", activityId: "activity-2", metadata: meta }, now);

    expect(result.metadata).toEqual(meta);
    expect(repo.createExtraAssignment).toHaveBeenCalledWith("athlete-2", "activity-2", now, meta);
  });
});
