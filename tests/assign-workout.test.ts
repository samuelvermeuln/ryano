import { describe, expect, it, vi } from "vitest";
import { AssignWorkout } from "@/modules/school/application/assign-workout";
import { WorkoutAssignmentStatus, WorkoutStatus } from "@/modules/school/domain/enums";
import { SchoolError } from "@/modules/school/domain/errors";
import type { PrismaClient } from "@prisma/client";

const now = new Date("2026-10-01T09:00:00Z");

function makeValidAssignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    workoutId: "workout-1",
    athleteId: "athlete-1",
    assignedBy: "user-1",
    schoolId: null,
    coachId: "coach-1",
    teamId: null,
    scheduledAt: null,
    dueAt: null,
    status: WorkoutAssignmentStatus.SCHEDULED,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    coachProfile: { findUnique: vi.fn() },
    workout: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    coachSchoolMembership: { findFirst: vi.fn() },
    schoolAthleteMembership: { findFirst: vi.fn() },
    workoutAssignment: { create: vi.fn().mockResolvedValue(makeValidAssignmentRow()) },
    workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

function makeDb(tx: ReturnType<typeof makeTx>) {
  return {
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaClient;
}

const activeCoach = { id: "coach-1", status: "ACTIVE" };
const activeWorkout = { id: "workout-1", status: WorkoutStatus.SCHEDULED, originSchoolId: null };
const existingUser = { id: "athlete-1" };

const basicInput = {
  workoutId: "workout-1",
  athleteId: "athlete-1",
};

describe("AssignWorkout [T136]", () => {
  it("rejects unauthenticated actors", async () => {
    const useCase = new AssignWorkout(makeDb(makeTx()), () => now);
    await expect(useCase.execute(null, basicInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects unknown coach profile", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", basicInput)).rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND" });
  });

  it("rejects inactive coach", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "coach-1", status: "INACTIVE" });
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", basicInput)).rejects.toMatchObject({ code: "COACH_INACTIVE" });
  });

  it("rejects unknown workout", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    (tx.workout.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", basicInput)).rejects.toMatchObject({ code: "WORKOUT_NOT_FOUND" });
  });

  it("rejects CANCELLED workout", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    (tx.workout.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...activeWorkout, status: WorkoutStatus.CANCELLED });
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", basicInput)).rejects.toMatchObject({ code: "WORKOUT_NOT_ASSIGNABLE" });
  });

  it("rejects unknown athlete", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    (tx.workout.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeWorkout);
    (tx.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", basicInput)).rejects.toMatchObject({ code: "ATHLETE_NOT_FOUND" });
  });

  it("assigns a workout to an athlete without school context", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    (tx.workout.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeWorkout);
    (tx.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingUser);
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-1", basicInput);
    expect(result.id).toBe("assignment-1");
    expect(result.status).toBe(WorkoutAssignmentStatus.SCHEDULED);
    expect(tx.workoutAssignment.create).toHaveBeenCalledOnce();
    expect(tx.workoutAssignmentHistory.create).toHaveBeenCalledOnce();
  });

  it("requires coach school membership when schoolId is provided", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    (tx.workout.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeWorkout);
    (tx.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingUser);
    (tx.coachSchoolMembership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", { ...basicInput, schoolId: "school-1" }))
      .rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE" });
  });

  it("requires athlete school membership when schoolId is provided", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    (tx.workout.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeWorkout);
    (tx.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingUser);
    (tx.coachSchoolMembership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "membership-1" });
    (tx.schoolAthleteMembership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", { ...basicInput, schoolId: "school-1" }))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_MEMBER" });
  });

  it("assigns with school context when both memberships are active", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    (tx.workout.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeWorkout);
    (tx.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingUser);
    (tx.coachSchoolMembership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "coach-membership-1" });
    (tx.schoolAthleteMembership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "athlete-membership-1" });
    (tx.workoutAssignment.create as ReturnType<typeof vi.fn>).mockResolvedValue(makeValidAssignmentRow({ schoolId: "school-1" }));
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-1", { ...basicInput, schoolId: "school-1" });
    expect(result.id).toBe("assignment-1");
  });
});
