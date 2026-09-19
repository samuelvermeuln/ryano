import { describe, expect, it, vi } from "vitest";
import { CreateWorkout } from "@/modules/school/application/create-workout";
import { WorkoutOwnerType, WorkoutStatus } from "@/modules/school/domain/enums";
import type { PrismaClient } from "@prisma/client";

const now = new Date("2026-10-01T09:00:00Z");

function makeValidWorkoutRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "workout-id",
    templateId: null,
    templateVersion: null,
    authorCoachId: "coach-1",
    originSchoolId: null,
    title: "Treino de corrida",
    description: null,
    sportType: "RUN",
    scheduledDate: null,
    scheduledStartAt: null,
    status: WorkoutStatus.DRAFT,
    snapshotPayload: { templateId: null, templateVersion: null, title: "Treino de corrida", description: null, sportType: "RUN", content: { blocks: [] } },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTx(overrides: Record<string, unknown> = {}) {
  const tx = {
    coachProfile: { findUnique: vi.fn() },
    school: { findUnique: vi.fn() },
    coachSchoolMembership: { findFirst: vi.fn() },
    workoutTemplate: { findUnique: vi.fn() },
    workoutBlock: { findMany: vi.fn().mockResolvedValue([]) },
    workout: { create: vi.fn().mockResolvedValue(makeValidWorkoutRow()) },
    workoutAssignmentHistory: { create: vi.fn() },
    ...overrides,
  };
  return tx;
}

function makeDb(tx: ReturnType<typeof makeTx>) {
  return {
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaClient;
}

const activeCoach = { id: "coach-1", status: "ACTIVE" };
const activeSchool = { id: "school-1", status: "ACTIVE" };
const activeMembership = { id: "membership-1" };

const personalInput = {
  ownerType: WorkoutOwnerType.COACH,
  title: "Treino de corrida",
  sportType: "RUN",
  blocks: [],
};

const schoolInput = {
  ownerType: WorkoutOwnerType.SCHOOL,
  schoolId: "school-1",
  title: "Treino da escola",
  sportType: "SWIM",
  blocks: [],
};

describe("CreateWorkout [T133]", () => {
  it("rejects unauthenticated actors", async () => {
    const useCase = new CreateWorkout(makeDb(makeTx()), () => now);
    await expect(useCase.execute(null, personalInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects if coach profile not found", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", personalInput)).rejects.toMatchObject({ code: "COACH_PROFILE_NOT_FOUND" });
  });

  it("rejects inactive coach", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "coach-1", status: "INACTIVE" });
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", personalInput)).rejects.toMatchObject({ code: "COACH_INACTIVE" });
  });

  it("creates a personal workout for an active coach", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-1", personalInput);
    expect(result.id).toBe("workout-id");
    expect(result.status).toBe(WorkoutStatus.DRAFT);
    expect(tx.workout.create).toHaveBeenCalledOnce();
  });

  it("passes SCHEDULED status to repository when scheduledDate is supplied", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    const scheduledRow = makeValidWorkoutRow({ status: WorkoutStatus.SCHEDULED });
    (tx.workout.create as ReturnType<typeof vi.fn>).mockResolvedValue(scheduledRow);
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-1", { ...personalInput, scheduledDate: "2026-10-10T08:00:00Z" });
    expect(result.status).toBe(WorkoutStatus.SCHEDULED);
    // Verify the data passed to create contains SCHEDULED status
    const createCall = (tx.workout.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.status).toBe(WorkoutStatus.SCHEDULED);
  });

  it("requires school membership for SCHOOL-owned workouts", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    (tx.school.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeSchool);
    (tx.coachSchoolMembership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", schoolInput)).rejects.toMatchObject({ code: "COACH_SCHOOL_MEMBERSHIP_NOT_ACTIVE" });
  });

  it("creates a school workout when coach has active membership", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    (tx.school.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeSchool);
    (tx.coachSchoolMembership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(activeMembership);
    (tx.workout.create as ReturnType<typeof vi.fn>).mockResolvedValue(makeValidWorkoutRow({ originSchoolId: "school-1", sportType: "SWIM", title: "Treino da escola" }));
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    const result = await useCase.execute("user-1", schoolInput);
    expect(result.id).toBe("workout-id");
    expect(tx.workout.create).toHaveBeenCalledOnce();
  });

  it("rejects SCHOOL workout without schoolId", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", { ownerType: WorkoutOwnerType.SCHOOL, title: "x", sportType: "RUN", blocks: [] }))
      .rejects.toThrow();
  });

  it("rejects school workout if school is INACTIVE", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    (tx.school.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "school-1", status: "INACTIVE" });
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", schoolInput)).rejects.toMatchObject({ code: "SCHOOL_INACTIVE" });
  });

  it("rejects unknown template", async () => {
    const tx = makeTx();
    (tx.coachProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeCoach);
    (tx.workoutTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new CreateWorkout(makeDb(tx), () => now);
    await expect(useCase.execute("user-1", { ...personalInput, templateId: "tmpl-x" }))
      .rejects.toMatchObject({ code: "WORKOUT_TEMPLATE_NOT_FOUND" });
  });
});
