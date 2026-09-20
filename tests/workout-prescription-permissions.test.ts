/**
 * T149 — Permission tests for workout prescription
 *
 * Verifies that AssignWorkout, RescheduleWorkout, and CancelWorkout
 * enforce actor identity and school membership before mutating state.
 */
import { describe, expect, it, vi } from "vitest";
import { AssignWorkout } from "@/modules/school/application/assign-workout";
import { RescheduleWorkout } from "@/modules/school/application/reschedule-workout";
import { CancelWorkout } from "@/modules/school/application/cancel-workout";
import { WorkoutAssignmentStatus, WorkoutStatus } from "@/modules/school/domain/enums";
import type { PrismaClient } from "@prisma/client";

const now = new Date("2026-10-01T10:00:00Z");
const future = new Date("2026-10-08T10:00:00Z");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const scheduledAssignment: {
  id: string; workoutId: string; athleteId: string; assignedBy: string; schoolId: string;
  coachId: string; teamId: null; status: WorkoutAssignmentStatus; scheduledAt: Date; dueAt: null;
  createdAt: Date; updatedAt: Date;
} = {
  id: "assignment-1",
  workoutId: "workout-1",
  athleteId: "athlete-1",
  assignedBy: "user-coach",
  schoolId: "school-1",
  coachId: "coach-1",
  teamId: null,
  status: WorkoutAssignmentStatus.SCHEDULED,
  scheduledAt: future,
  dueAt: null,
  createdAt: now,
  updatedAt: now,
};

const savedAssignment: typeof scheduledAssignment = {
  id: "assignment-1",
  workoutId: "workout-1",
  athleteId: "athlete-1",
  assignedBy: "user-coach",
  schoolId: "school-1",
  coachId: "coach-1",
  teamId: null,
  status: WorkoutAssignmentStatus.SCHEDULED,
  scheduledAt: future,
  dueAt: null,
  createdAt: now,
  updatedAt: now,
};

function makeAssignTx(overrides: {
  coach?: object | null;
  workout?: object | null;
  athlete?: object | null;
  coachMembership?: object | null;
  athleteMembership?: object | null;
} = {}) {
  const defaults = {
    coach: { id: "coach-1", status: "ACTIVE" },
    workout: { id: "workout-1", status: WorkoutStatus.SCHEDULED, originSchoolId: null },
    athlete: { id: "athlete-1" },
    coachMembership: { id: "cm-1" },
    athleteMembership: { id: "am-1" },
  };
  const merged = { ...defaults, ...overrides };
  return {
    coachProfile: { findUnique: vi.fn().mockResolvedValue(merged.coach) },
    workout: { findUnique: vi.fn().mockResolvedValue(merged.workout) },
    user: { findUnique: vi.fn().mockResolvedValue(merged.athlete) },
    coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue(merged.coachMembership) },
    schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue(merged.athleteMembership) },
    workoutAssignment: { create: vi.fn().mockResolvedValue(savedAssignment) },
    workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({}) },
  };
}

function makeRescheduleTx(assignmentOverride?: Partial<typeof scheduledAssignment>, coachOverride?: { id: string } | null) {
  return {
    workoutAssignment: {
      findUnique: vi.fn().mockResolvedValue(assignmentOverride !== undefined ? { ...scheduledAssignment, ...assignmentOverride } : scheduledAssignment),
      update: vi.fn().mockResolvedValue({ ...scheduledAssignment, status: WorkoutAssignmentStatus.RESCHEDULED }),
    },
    coachProfile: { findUnique: vi.fn().mockResolvedValue(coachOverride !== undefined ? coachOverride : { id: "coach-1" }) },
    workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({}) },
  };
}

function makeCancelTx(assignmentOverride?: Partial<typeof scheduledAssignment>, coachOverride?: { id: string } | null) {
  return {
    workoutAssignment: {
      findUnique: vi.fn().mockResolvedValue(assignmentOverride !== undefined ? { ...scheduledAssignment, ...assignmentOverride } : scheduledAssignment),
      update: vi.fn().mockResolvedValue({ ...scheduledAssignment, status: WorkoutAssignmentStatus.CANCELLED }),
    },
    coachProfile: { findUnique: vi.fn().mockResolvedValue(coachOverride !== undefined ? coachOverride : { id: "coach-1" }) },
    workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({}) },
  };
}

function makeDb(tx: object): PrismaClient {
  return { $transaction: vi.fn((fn: (t: unknown) => unknown) => fn(tx)) } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// AssignWorkout — actor identity
// ---------------------------------------------------------------------------

describe("T149 — AssignWorkout permission enforcement", () => {
  it("rejects unauthenticated caller (null userId)", async () => {
    const useCase = new AssignWorkout(makeDb(makeAssignTx()), () => now);
    await expect(useCase.execute(null, { workoutId: "workout-1", athleteId: "athlete-1" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects caller with no coach profile", async () => {
    const tx = makeAssignTx({ coach: null });
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-nobody", { workoutId: "workout-1", athleteId: "athlete-1" }))
      .rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND" });
  });

  it("rejects inactive coach", async () => {
    const tx = makeAssignTx({ coach: { id: "coach-1", status: "INACTIVE" } });
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-coach", { workoutId: "workout-1", athleteId: "athlete-1" }))
      .rejects.toMatchObject({ code: "COACH_INACTIVE" });
  });

  it("rejects when workout is cancelled", async () => {
    const tx = makeAssignTx({ workout: { id: "workout-1", status: WorkoutStatus.CANCELLED, originSchoolId: null } });
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-coach", { workoutId: "workout-1", athleteId: "athlete-1" }))
      .rejects.toMatchObject({ code: "WORKOUT_NOT_ASSIGNABLE" });
  });

  it("rejects when workout is archived", async () => {
    const tx = makeAssignTx({ workout: { id: "workout-1", status: WorkoutStatus.ARCHIVED, originSchoolId: null } });
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-coach", { workoutId: "workout-1", athleteId: "athlete-1" }))
      .rejects.toMatchObject({ code: "WORKOUT_NOT_ASSIGNABLE" });
  });

  it("rejects when coach has no active membership in target school", async () => {
    const tx = makeAssignTx({ coachMembership: null });
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-coach", { workoutId: "workout-1", athleteId: "athlete-1", schoolId: "school-1" }))
      .rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE" });
  });

  it("rejects when athlete is not an active member of target school", async () => {
    const tx = makeAssignTx({ athleteMembership: null });
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-coach", { workoutId: "workout-1", athleteId: "athlete-1", schoolId: "school-1" }))
      .rejects.toMatchObject({ code: "ATHLETE_NOT_MEMBER" });
  });

  it("allows assignment when coach and athlete are active members of the school", async () => {
    const tx = makeAssignTx();
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-coach", { workoutId: "workout-1", athleteId: "athlete-1", schoolId: "school-1" });
    expect(result.id).toBe("assignment-1");
    expect(tx.workoutAssignment.create).toHaveBeenCalledOnce();
  });

  it("allows personal assignment without a schoolId (no membership check)", async () => {
    const tx = makeAssignTx();
    const useCase = new AssignWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-coach", { workoutId: "workout-1", athleteId: "athlete-1" });
    expect(result.id).toBe("assignment-1");
    expect(tx.coachSchoolMembership.findFirst).not.toHaveBeenCalled();
    expect(tx.schoolAthleteMembership.findFirst).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// RescheduleWorkout — only the assigning coach can reschedule
// ---------------------------------------------------------------------------

describe("T149 — RescheduleWorkout permission enforcement", () => {
  it("rejects unauthenticated caller", async () => {
    const useCase = new RescheduleWorkout(makeDb(makeRescheduleTx()), () => now);
    await expect(useCase.execute(null, { assignmentId: "assignment-1", scheduledAt: future }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a coach who did not create the assignment", async () => {
    const tx = makeRescheduleTx(undefined, { id: "coach-OTHER" });
    const useCase = new RescheduleWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-other-coach", { assignmentId: "assignment-1", scheduledAt: future }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows the assigning coach to reschedule", async () => {
    const tx = makeRescheduleTx(undefined, { id: "coach-1" });
    const useCase = new RescheduleWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-coach", { assignmentId: "assignment-1", scheduledAt: future });
    expect(result.status).toBe(WorkoutAssignmentStatus.RESCHEDULED);
  });

  it("rejects when coach profile is missing", async () => {
    const tx = makeRescheduleTx(undefined, null);
    const useCase = new RescheduleWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-coach", { assignmentId: "assignment-1", scheduledAt: future }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects rescheduling a cancelled assignment", async () => {
    const tx = makeRescheduleTx({ status: WorkoutAssignmentStatus.CANCELLED });
    const useCase = new RescheduleWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-coach", { assignmentId: "assignment-1", scheduledAt: future }))
      .rejects.toMatchObject({ code: "WORKOUT_INVALID_TRANSITION" });
  });
});

// ---------------------------------------------------------------------------
// CancelWorkout — only the assigning coach can cancel
// ---------------------------------------------------------------------------

describe("T149 — CancelWorkout permission enforcement", () => {
  it("rejects unauthenticated caller", async () => {
    const useCase = new CancelWorkout(makeDb(makeCancelTx()), () => now);
    await expect(useCase.execute(null, { assignmentId: "assignment-1" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a coach who did not create the assignment", async () => {
    const tx = makeCancelTx(undefined, { id: "coach-OTHER" });
    const useCase = new CancelWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-other-coach", { assignmentId: "assignment-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows the assigning coach to cancel", async () => {
    const tx = makeCancelTx(undefined, { id: "coach-1" });
    const useCase = new CancelWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-coach", { assignmentId: "assignment-1" });
    expect(result.status).toBe(WorkoutAssignmentStatus.CANCELLED);
  });

  it("rejects cancelling an already-cancelled assignment", async () => {
    const tx = makeCancelTx({ status: WorkoutAssignmentStatus.CANCELLED });
    const useCase = new CancelWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-coach", { assignmentId: "assignment-1" }))
      .rejects.toMatchObject({ code: "WORKOUT_INVALID_TRANSITION" });
  });

  it("rejects cancelling a completed assignment", async () => {
    const tx = makeCancelTx({ status: WorkoutAssignmentStatus.COMPLETED });
    const useCase = new CancelWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-coach", { assignmentId: "assignment-1" }))
      .rejects.toMatchObject({ code: "WORKOUT_INVALID_TRANSITION" });
  });
});
