import { describe, expect, it, vi } from "vitest";
import { UpdateWorkoutAssignmentStatus } from "@/modules/school/application/update-workout-assignment-status";
import { WorkoutAssignmentStatus } from "@/modules/school/domain/enums";
import { SchoolError } from "@/modules/school/domain/errors";

const baseAssignment = {
  id: "assignment-1",
  workoutId: "workout-1",
  athleteId: "athlete-1",
  assignedBy: "admin-1",
  schoolId: null,
  coachId: null,
  teamId: null,
  scheduledAt: new Date("2025-01-10T10:00:00Z"),
  dueAt: new Date("2025-01-11T10:00:00Z"),
  status: WorkoutAssignmentStatus.SCHEDULED,
  createdAt: new Date("2024-12-01T10:00:00Z"),
  updatedAt: new Date("2024-12-01T10:00:00Z"),
};

const mockRepo = () => ({
  findById: vi.fn(),
  updateStatus: vi.fn(),
  saveHistory: vi.fn(),
});

describe("UpdateWorkoutAssignmentStatus", () => {
  it("rejects unauthorized actors", async () => {
    const repo = mockRepo();
    const usecase = new UpdateWorkoutAssignmentStatus(repo);
    const now = new Date("2025-01-01T10:00:00Z");

    await expect(usecase.execute({ userId: "anon", isActive: false }, { assignmentId: "assignment-1", status: "COMPLETED" as any }, now))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws STORE_NOT_FOUND when assignment doesn't exist", async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(null);
    const usecase = new UpdateWorkoutAssignmentStatus(repo);
    const now = new Date("2025-01-01T10:00:00Z");

    await expect(usecase.execute({ userId: "admin-1", isActive: true }, { assignmentId: "missing-1", status: "COMPLETED" as any }, now))
      .rejects.toMatchObject({ code: "STORE_NOT_FOUND" });
  });

  it("returns assignment idempotent when status is unchanged", async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(baseAssignment);
    const usecase = new UpdateWorkoutAssignmentStatus(repo);
    const now = new Date("2025-01-01T10:00:00Z");

    const result = await usecase.execute({ userId: "admin-1", isActive: true }, { assignmentId: "assignment-1", status: "SCHEDULED" as any }, now);
    
    expect(result).toEqual(baseAssignment);
    expect(repo.updateStatus).not.toHaveBeenCalled();
    expect(repo.saveHistory).not.toHaveBeenCalled();
  });

  it("updates status and creates history record", async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(baseAssignment);
    const usecase = new UpdateWorkoutAssignmentStatus(repo);
    const now = new Date("2025-01-01T10:00:00Z");

    const result = await usecase.execute(
      { userId: "admin-1", isActive: true },
      { assignmentId: "assignment-1", status: "COMPLETED" as any, reason: "Manual update" },
      now
    );

    expect(result.status).toBe(WorkoutAssignmentStatus.COMPLETED);
    expect(result.updatedAt).toBe(now);

    expect(repo.updateStatus).toHaveBeenCalledWith("assignment-1", WorkoutAssignmentStatus.COMPLETED, now);
    expect(repo.saveHistory).toHaveBeenCalledWith(expect.objectContaining({
        workoutAssignmentId: "assignment-1",
        actorUserId: "admin-1",
        eventType: "COMPLETED",
        payload: {
            reason: "Manual update",
            previousStatus: "SCHEDULED"
        }
    }));
  });
});
