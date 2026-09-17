import { describe, expect, it } from "vitest";
import { WorkoutAssignmentStatus } from "@/modules/school/domain/enums";
import {
  createWorkoutAssignment,
  createWorkoutAssignmentHistory,
  workoutAssignmentHistorySchema,
  workoutAssignmentSchema,
} from "@/modules/school/domain/workout-assignment";

const now = new Date("2026-09-17T10:00:00Z");

const base = {
  id: "assignment-1",
  workoutId: "workout-1",
  athleteId: "athlete-user-1",
  assignedBy: "coach-user-1",
  schoolId: null as null | string,
  coachId: null as null | string,
  teamId: null as null | string,
  scheduledAt: null as null | Date,
  dueAt: null as null | Date,
};

describe("WorkoutAssignment entity [T135]", () => {
  it("defaults status to SCHEDULED when not supplied", () => {
    const assignment = createWorkoutAssignment(base, now);
    expect(assignment.status).toBe(WorkoutAssignmentStatus.SCHEDULED);
  });

  it("accepts an explicit initial status", () => {
    const assignment = createWorkoutAssignment({ ...base, status: WorkoutAssignmentStatus.AVAILABLE }, now);
    expect(assignment.status).toBe(WorkoutAssignmentStatus.AVAILABLE);
  });

  it("carries nullable context fields through", () => {
    const assignment = createWorkoutAssignment({
      ...base,
      schoolId: "school-1",
      coachId: "coach-1",
      teamId: "team-1",
    }, now);
    expect(assignment).toMatchObject({ schoolId: "school-1", coachId: "coach-1", teamId: "team-1" });
  });

  it("sets scheduledAt and dueAt when both supplied and consistent", () => {
    const scheduledAt = new Date("2026-09-20T08:00:00Z");
    const dueAt = new Date("2026-09-20T20:00:00Z");
    const assignment = createWorkoutAssignment({ ...base, scheduledAt, dueAt }, now);
    expect(assignment.scheduledAt).toEqual(scheduledAt);
    expect(assignment.dueAt).toEqual(dueAt);
  });

  it("allows scheduledAt equal to dueAt", () => {
    const at = new Date("2026-09-20T08:00:00Z");
    expect(() => createWorkoutAssignment({ ...base, scheduledAt: at, dueAt: at }, now)).not.toThrow();
  });

  it("rejects dueAt earlier than scheduledAt", () => {
    const scheduledAt = new Date("2026-09-20T10:00:00Z");
    const dueAt = new Date("2026-09-20T08:00:00Z");
    expect(() => createWorkoutAssignment({ ...base, scheduledAt, dueAt }, now)).toThrow();
  });

  it("rejects updatedAt before createdAt via schema direct parse", () => {
    const past = new Date("2026-09-16T00:00:00Z");
    expect(() =>
      workoutAssignmentSchema.parse({ ...base, status: "SCHEDULED", createdAt: now, updatedAt: past })
    ).toThrow();
  });

  it("rejects unknown status value", () => {
    expect(() => workoutAssignmentSchema.parse({ ...base, status: "UNKNOWN_STATUS", createdAt: now, updatedAt: now })).toThrow();
  });

  it("rejects blank or whitespace-padded ids", () => {
    expect(() => createWorkoutAssignment({ ...base, id: "" }, now)).toThrow();
    expect(() => createWorkoutAssignment({ ...base, athleteId: " user-1" }, now)).toThrow();
  });

  it("returns defensive date copies that are independent of the input", () => {
    const scheduledAt = new Date("2026-09-20T08:00:00Z");
    const assignment = createWorkoutAssignment({ ...base, scheduledAt }, now);
    scheduledAt.setFullYear(2099);
    expect(assignment.scheduledAt!.getFullYear()).toBe(2026);
  });
});

describe("WorkoutAssignmentHistory entity [T135]", () => {
  const historyBase = {
    id: "history-1",
    workoutAssignmentId: "assignment-1",
    eventType: "ASSIGNED",
    actorUserId: "coach-user-1",
    payload: { note: "initial assignment" },
  };

  it("creates a valid history record with current timestamp", () => {
    const record = createWorkoutAssignmentHistory(historyBase, now);
    expect(record).toMatchObject({ ...historyBase, createdAt: now });
  });

  it("accepts various event types within 100 chars", () => {
    expect(() => createWorkoutAssignmentHistory({ ...historyBase, eventType: "RESCHEDULED" }, now)).not.toThrow();
    expect(() => createWorkoutAssignmentHistory({ ...historyBase, eventType: "CANCELLED" }, now)).not.toThrow();
    expect(() => createWorkoutAssignmentHistory({ ...historyBase, eventType: "X".repeat(100) }, now)).not.toThrow();
  });

  it("rejects event type exceeding 100 chars", () => {
    expect(() => createWorkoutAssignmentHistory({ ...historyBase, eventType: "X".repeat(101) }, now)).toThrow();
  });

  it("rejects blank event type", () => {
    expect(() => createWorkoutAssignmentHistory({ ...historyBase, eventType: "" }, now)).toThrow();
    expect(() => createWorkoutAssignmentHistory({ ...historyBase, eventType: "   " }, now)).toThrow();
  });

  it("rejects extra unknown fields via strict schema", () => {
    expect(() =>
      workoutAssignmentHistorySchema.parse({ ...historyBase, createdAt: now, extraField: true })
    ).toThrow();
  });
});
