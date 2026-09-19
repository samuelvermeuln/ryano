import { describe, expect, it, vi } from "vitest";
import { RescheduleWorkout } from "@/modules/school/application/reschedule-workout";
import { CancelWorkout } from "@/modules/school/application/cancel-workout";
import { WorkoutAssignmentStatus } from "@/modules/school/domain/enums";
import type { PrismaClient } from "@prisma/client";

const now = new Date("2026-10-01T09:00:00Z");

function makeAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    workoutId: "workout-1",
    athleteId: "athlete-1",
    assignedBy: "user-1",
    schoolId: null,
    coachId: "coach-1",
    teamId: null,
    scheduledAt: new Date("2026-10-10T08:00:00Z"),
    dueAt: null,
    status: WorkoutAssignmentStatus.SCHEDULED,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTx(assignment: ReturnType<typeof makeAssignment>) {
  return {
    workoutAssignment: {
      findUnique: vi.fn().mockResolvedValue(assignment),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...assignment, ...data }),
      ),
    },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1" }) },
    workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({}) },
  };
}

function makeDb(tx: ReturnType<typeof makeTx>) {
  return {
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaClient;
}

// ─── RescheduleWorkout ──────────────────────────────────────────────────────

describe("RescheduleWorkout [T138]", () => {
  it("rejects unauthenticated actors", async () => {
    const useCase = new RescheduleWorkout(makeDb(makeTx(makeAssignment())), () => now);
    await expect(useCase.execute(null, { assignmentId: "assignment-1", scheduledAt: "2026-10-20T08:00:00Z" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects missing assignment", async () => {
    const tx = makeTx(makeAssignment());
    (tx.workoutAssignment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new RescheduleWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", { assignmentId: "assignment-1", scheduledAt: "2026-10-20T08:00:00Z" }))
      .rejects.toMatchObject({ code: "STORE_NOT_FOUND" });
  });

  it("rejects non-reschedulable status (COMPLETED)", async () => {
    const tx = makeTx(makeAssignment({ status: WorkoutAssignmentStatus.COMPLETED }));
    const useCase = new RescheduleWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", { assignmentId: "assignment-1", scheduledAt: "2026-10-20T08:00:00Z" }))
      .rejects.toMatchObject({ code: "WORKOUT_INVALID_TRANSITION" });
  });

  it("rejects when actor is not the assigning coach", async () => {
    const tx = makeTx(makeAssignment({ coachId: "other-coach" }));
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "coach-1" });
    const useCase = new RescheduleWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", { assignmentId: "assignment-1", scheduledAt: "2026-10-20T08:00:00Z" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when dueAt is before scheduledAt", async () => {
    const useCase = new RescheduleWorkout(makeDb(makeTx(makeAssignment())), () => now);
    await expect(useCase.execute("user-1", {
      assignmentId: "assignment-1",
      scheduledAt: "2026-10-20T08:00:00Z",
      dueAt: "2026-10-19T08:00:00Z",
    })).rejects.toMatchObject({ code: "WORKOUT_INVALID_PERIOD" });
  });

  it("reschedules a SCHEDULED assignment", async () => {
    const tx = makeTx(makeAssignment());
    const useCase = new RescheduleWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-1", {
      assignmentId: "assignment-1",
      scheduledAt: "2026-10-20T08:00:00Z",
    });
    expect(result.status).toBe(WorkoutAssignmentStatus.RESCHEDULED);
    expect(tx.workoutAssignment.update).toHaveBeenCalledOnce();
    expect(tx.workoutAssignmentHistory.create).toHaveBeenCalledOnce();
  });

  it("reschedules an AVAILABLE assignment", async () => {
    const tx = makeTx(makeAssignment({ status: WorkoutAssignmentStatus.AVAILABLE }));
    const useCase = new RescheduleWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-1", {
      assignmentId: "assignment-1",
      scheduledAt: "2026-10-20T08:00:00Z",
    });
    expect(result.status).toBe(WorkoutAssignmentStatus.RESCHEDULED);
  });

  it("records reason in history when supplied", async () => {
    const tx = makeTx(makeAssignment());
    const useCase = new RescheduleWorkout(makeDb(tx), () => now);
    await useCase.execute("user-1", {
      assignmentId: "assignment-1",
      scheduledAt: "2026-10-20T08:00:00Z",
      reason: "Athlete injured",
    });
    const historyCall = (tx.workoutAssignmentHistory.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(historyCall.data.payload).toMatchObject({ reason: "Athlete injured" });
  });
});

// ─── CancelWorkout ──────────────────────────────────────────────────────────

describe("CancelWorkout [T139]", () => {
  it("rejects unauthenticated actors", async () => {
    const useCase = new CancelWorkout(makeDb(makeTx(makeAssignment())), () => now);
    await expect(useCase.execute(null, { assignmentId: "assignment-1" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects missing assignment", async () => {
    const tx = makeTx(makeAssignment());
    (tx.workoutAssignment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new CancelWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", { assignmentId: "assignment-1" }))
      .rejects.toMatchObject({ code: "STORE_NOT_FOUND" });
  });

  it("rejects non-cancellable status (COMPLETED)", async () => {
    const tx = makeTx(makeAssignment({ status: WorkoutAssignmentStatus.COMPLETED }));
    const useCase = new CancelWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", { assignmentId: "assignment-1" }))
      .rejects.toMatchObject({ code: "WORKOUT_INVALID_TRANSITION" });
  });

  it("rejects when actor is not the assigning coach", async () => {
    const tx = makeTx(makeAssignment({ coachId: "other-coach" }));
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "coach-1" });
    const useCase = new CancelWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", { assignmentId: "assignment-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cancels a SCHEDULED assignment", async () => {
    const tx = makeTx(makeAssignment());
    const useCase = new CancelWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-1", { assignmentId: "assignment-1" });
    expect(result.status).toBe(WorkoutAssignmentStatus.CANCELLED);
    expect(tx.workoutAssignment.update).toHaveBeenCalledOnce();
    expect(tx.workoutAssignmentHistory.create).toHaveBeenCalledOnce();
  });

  it("cancels a RESCHEDULED assignment", async () => {
    const tx = makeTx(makeAssignment({ status: WorkoutAssignmentStatus.RESCHEDULED }));
    const useCase = new CancelWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-1", { assignmentId: "assignment-1" });
    expect(result.status).toBe(WorkoutAssignmentStatus.CANCELLED);
  });

  it("records reason in history when supplied", async () => {
    const tx = makeTx(makeAssignment());
    const useCase = new CancelWorkout(makeDb(tx), () => now);
    await useCase.execute("user-1", { assignmentId: "assignment-1", reason: "Coach cancelled" });
    const historyCall = (tx.workoutAssignmentHistory.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(historyCall.data.payload).toMatchObject({ reason: "Coach cancelled" });
  });
});
