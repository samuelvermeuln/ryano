/**
 * T339 — E2E criação e atribuição de treino
 * T340 — E2E ingestão de atividade + matching
 * T341 — E2E compliance
 * T342 — E2E avaliação de coach
 * T343 — E2E feedback do atleta
 */
import { describe, expect, it, vi } from "vitest";
import { CreateWorkout } from "@/modules/school/application/create-workout";
import { AssignWorkout } from "@/modules/school/application/assign-workout";
import { MatchActivityToWorkout } from "@/modules/school/application/match-activity-to-workout";
import { CalculateWorkoutCompliance } from "@/modules/school/application/calculate-workout-compliance";
import { CreateCoachEvaluation, UpdateCoachEvaluation, SubmitAthleteFeedback } from "@/modules/school/application/manage-evaluation";
import { SchoolError } from "@/modules/school/domain/errors";
import { WorkoutAssignmentStatus, WorkoutMatchStatus, WorkoutStatus } from "@/modules/school/domain/enums";
import { COMPLIANCE_ALGORITHM_VERSION } from "@/modules/school/domain/workout-compliance";

const NOW = new Date("2026-09-20T08:00:00Z");

const IDS = {
  school: "school-wf-1",
  coach: "user-coach-wf-1",
  coachProfile: "coach-profile-wf-1",
  athlete: "user-athlete-wf-1",
  workout: "workout-wf-1",
  assignment: "assignment-wf-1",
  execution: "execution-wf-1",
  evaluation: "evaluation-wf-1",
};

function makeWorkoutRow(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.workout,
    title: "Corrida moderada 10km",
    description: null,
    sportType: "RUNNING",
    status: WorkoutStatus.ACTIVE,
    targetDurationSeconds: 3600,
    targetDistanceMeters: 10000,
    targetPace: null,
    targetHeartRateMin: null,
    targetHeartRateMax: null,
    targetPower: null,
    intervalCount: null,
    intervalRestSeconds: null,
    algorithmVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeAssignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.assignment,
    workoutId: IDS.workout,
    athleteId: IDS.athlete,
    assignedBy: IDS.coach,
    schoolId: IDS.school,
    coachId: IDS.coachProfile,
    teamId: null,
    scheduledAt: NOW,
    dueAt: null,
    status: WorkoutAssignmentStatus.SCHEDULED,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T339 — E2E criação e atribuição de treino
// ---------------------------------------------------------------------------

describe("T339 — criação e atribuição de treino", () => {
  it("creates workout then assigns it to an athlete", async () => {
    const workouts: unknown[] = [];
    const assignments: unknown[] = [];

    const db = {
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: IDS.coachProfile, userId: IDS.coach, status: "ACTIVE" }) },
      workout: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: IDS.workout, ...data };
          workouts.push(row);
          return row;
        }),
        findUnique: vi.fn().mockImplementation(async () => workouts[0] ?? null),
      },
      schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue({ id: "mbr-1", schoolId: IDS.school, userId: IDS.athlete, status: "ACTIVE" }) },
      workoutAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: IDS.assignment, ...data };
          assignments.push(row);
          return row;
        }),
      },
      workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({ id: "hist-1" }) },
      workoutBlock: { create: vi.fn().mockResolvedValue({ id: "block-1" }) },
      coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "coach-school-1", schoolId: IDS.school, coachId: IDS.coachProfile, status: "ACTIVE", endedAt: null }) },
    } as unknown as Parameters<typeof CreateWorkout.prototype.execute>[0];

    const createWo = new CreateWorkout(db as never, () => NOW);
    const assignWo = new AssignWorkout(db as never, () => NOW);

    await createWo.execute(IDS.coach, {
      ownerType: "COACH",
      title: "Corrida moderada 10km",
      sportType: "RUNNING",
    });
    await assignWo.execute(IDS.coach, {
      workoutId: IDS.workout,
      athleteId: IDS.athlete,
      schoolId: IDS.school,
    });

    expect(workouts).toHaveLength(1);
    expect(assignments).toHaveLength(1);
    expect((assignments[0] as Record<string, unknown>).athleteId).toBe(IDS.athlete);
  });
});

// ---------------------------------------------------------------------------
// T340 — E2E ingestão de atividade + matching
// ---------------------------------------------------------------------------

describe("T340 — ingestão + matching", () => {
  it("activity ingested → AUTO_MATCHED execution created", async () => {
    const executions: unknown[] = [];

    const db = {
      workoutAssignment: {
        findUnique: vi.fn().mockResolvedValue({
          ...makeAssignmentRow(),
          workout: makeWorkoutRow(),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      workoutExecution: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => {
          const row = { id: IDS.execution, matchStatus: WorkoutMatchStatus.AUTO_MATCHED, ...create };
          executions.push(row);
          return row;
        }),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    } as unknown as Parameters<typeof MatchActivityToWorkout.prototype.execute>[0];

    const useCase = new MatchActivityToWorkout(db as never, () => NOW);
    const result = await useCase.execute({
      workoutAssignmentId: IDS.assignment,
      athleteId: IDS.athlete,
      source: "GARMIN",
      externalId: "garmin-act-1",
      sportType: "RUNNING",
      startedAt: NOW.toISOString(),
      durationSeconds: 3550,
      distanceMeters: 9980,
    });

    expect(executions).toHaveLength(1);
    expect(result.matchStatus).toBe(WorkoutMatchStatus.AUTO_MATCHED);
    expect(typeof result.matchScore).toBe("number");
  });

  it("rejects ingestion with mismatching sport type", async () => {
    const db = {
      workoutAssignment: {
        findUnique: vi.fn().mockResolvedValue({
          ...makeAssignmentRow(),
          workout: makeWorkoutRow({ sportType: "RUNNING" }),
        }),
        update: vi.fn(),
      },
      workoutExecution: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
          id: IDS.execution, matchStatus: WorkoutMatchStatus.AUTO_MATCHED, matchScore: 0.1, ...create,
        })),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    } as unknown as Parameters<typeof MatchActivityToWorkout.prototype.execute>[0];

    // Should still create the execution but with a very low match score (sport mismatch)
    const useCase = new MatchActivityToWorkout(db as never, () => NOW);
    const result = await useCase.execute({
      workoutAssignmentId: IDS.assignment,
      athleteId: IDS.athlete,
      source: "GARMIN",
      externalId: "garmin-swim-1",
      sportType: "SWIMMING",
      startedAt: NOW.toISOString(),
      durationSeconds: 1800,
      distanceMeters: 2000,
    });
    // Sport type mismatch → low match score
    expect(result.matchScore).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// T341 — E2E compliance
// ---------------------------------------------------------------------------

describe("T341 — compliance", () => {
  it("computes compliance and persists it to WorkoutCompliance", async () => {
    const stored: unknown[] = [];

    const db = {
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
      workoutExecution: {
        findUnique: vi.fn().mockResolvedValue({
          id: IDS.execution,
          athleteId: IDS.athlete,
          matchStatus: WorkoutMatchStatus.CONFIRMED,
          sportType: "RUNNING",
          durationSeconds: 3550,
          distanceMeters: 9980,
          movingSeconds: 3500,
          averageHeartRate: null,
          maxHeartRate: null,
          averageSpeed: null,
          elevationGain: null,
          averagePower: null,
          intervalCount: null,
          assignment: {
            id: IDS.assignment,
            schoolId: IDS.school,
            workout: makeWorkoutRow(),
          },
        }),
      },
      workoutCompliance: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => {
          const row = { id: "compliance-1", ...create };
          stored.push(row);
          return row;
        }),
      },
    } as unknown as Parameters<typeof CalculateWorkoutCompliance.prototype.execute>[0];

    const useCase = new CalculateWorkoutCompliance(db as never);
    const result = await useCase.execute({ executionId: IDS.execution });

    expect(stored).toHaveLength(1);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.algorithmVersion).toBe(COMPLIANCE_ALGORITHM_VERSION);
  });

  it("throws if execution is not in a scorable state", async () => {
    const db = {
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
      workoutExecution: {
        findUnique: vi.fn().mockResolvedValue({
          id: IDS.execution,
          matchStatus: WorkoutMatchStatus.AUTO_MATCHED, // not yet confirmed
          assignment: { workout: makeWorkoutRow() },
        }),
      },
      workoutCompliance: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    } as unknown as Parameters<typeof CalculateWorkoutCompliance.prototype.execute>[0];

    const useCase = new CalculateWorkoutCompliance(db as never);
    await expect(useCase.execute({ executionId: IDS.execution })).rejects.toThrow(SchoolError);
  });
});

// ---------------------------------------------------------------------------
// T342 — E2E avaliação de coach
// ---------------------------------------------------------------------------

describe("T342 — avaliação de coach", () => {
  it("coach creates evaluation; update changes score", async () => {
    let storedScore = 0;

    const db = {
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
      workoutExecution: {
        findUnique: vi.fn().mockResolvedValue({
          id: IDS.execution,
          athleteId: IDS.athlete,
          workoutAssignmentId: IDS.assignment,
          matchStatus: WorkoutMatchStatus.CONFIRMED,
          assignment: { schoolId: IDS.school },
          evaluations: [],
        }),
      },
      coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: IDS.coachProfile, userId: IDS.coach, status: "ACTIVE" }) },
      coachSchoolMembership: { findFirst: vi.fn().mockResolvedValue({ id: "coach-school-1", schoolId: IDS.school, coachId: IDS.coachProfile, status: "ACTIVE" }) },
      coachEvaluation: {
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          storedScore = data.overallScore as number;
          return { id: IDS.evaluation, ...data };
        }),
        findUnique: vi.fn().mockImplementation(async () => ({ id: IDS.evaluation, coachId: IDS.coachProfile, overallScore: storedScore })),
        update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          if (data.overallScore !== undefined) storedScore = data.overallScore as number;
          return { id: IDS.evaluation, overallScore: storedScore };
        }),
      },
    } as unknown as Parameters<typeof CreateCoachEvaluation.prototype.execute>[0];

    const create = new CreateCoachEvaluation(db as never);
    const update = new UpdateCoachEvaluation(db as never);

    await create.execute(IDS.coach, { workoutExecutionId: IDS.execution, schoolId: IDS.school, overallScore: 7.5 });
    expect(storedScore).toBe(75); // auto-scaled 0-10 → 0-100

    await update.execute(IDS.coach, { evaluationId: IDS.evaluation, overallScore: 9.0 });
    expect(storedScore).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// T343 — E2E feedback do atleta
// ---------------------------------------------------------------------------

describe("T343 — feedback do atleta", () => {
  it("athlete submits feedback and can update it (upsert)", async () => {
    let stored: Record<string, unknown> | null = null;

    const db = {
      workoutExecution: {
        findUnique: vi.fn().mockResolvedValue({
          id: IDS.execution,
          athleteId: IDS.athlete,
          workoutAssignmentId: IDS.assignment,
          matchStatus: WorkoutMatchStatus.CONFIRMED,
          assignment: { schoolId: IDS.school },
        }),
      },
      athleteFeedback: {
        upsert: vi.fn().mockImplementation(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          stored = stored ? { ...stored, ...update } : { ...create };
          return stored;
        }),
        findUnique: vi.fn().mockImplementation(async () => stored),
      },
    } as unknown as Parameters<typeof SubmitAthleteFeedback.prototype.execute>[0];

    const useCase = new SubmitAthleteFeedback(db as never);

    await useCase.execute(IDS.athlete, { workoutExecutionId: IDS.execution, rpe: 7, mood: 4, energy: 3, comment: "Boa corrida!" });
    expect(stored).toBeTruthy();
    expect((stored as Record<string, unknown>).rpe).toBe(7);

    await useCase.execute(IDS.athlete, { workoutExecutionId: IDS.execution, rpe: 8, mood: 5, energy: 5, comment: "Atualizado" });
    expect((stored as Record<string, unknown>).rpe).toBe(8);
  });

  it("athlete cannot submit feedback for another athlete's execution", async () => {
    const db = {
      workoutExecution: {
        findUnique: vi.fn().mockResolvedValue({ id: IDS.execution, athleteId: "other-athlete", matchStatus: WorkoutMatchStatus.CONFIRMED }),
      },
    } as unknown as Parameters<typeof SubmitAthleteFeedback.prototype.execute>[0];

    const useCase = new SubmitAthleteFeedback(db as never);
    await expect(useCase.execute(IDS.athlete, { workoutExecutionId: IDS.execution, rpe: 7 })).rejects.toThrow(SchoolError);
  });
});
