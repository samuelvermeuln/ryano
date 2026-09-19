/**
 * T207 — CalculateWorkoutCompliance
 * T208 — RecalculateWorkoutCompliance
 * T209 — Integration: calculate compliance after matching confirmed
 *
 * CalculateWorkoutCompliance: computes and persists compliance for an execution.
 * RecalculateWorkoutCompliance: forces re-computation and updates the record.
 * Both share the same internal logic; only the DB operation differs (create vs upsert).
 */
import { randomUUID } from "node:crypto";
import { type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutMatchStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { COMPLIANCE_ALGORITHM_VERSION, createWorkoutCompliance } from "../domain/workout-compliance";
import { calculateCompliance } from "../domain/workout-compliance-service";
import type { WorkoutExecution } from "../domain/workout-execution";
import type { WorkoutSnapshot } from "../domain/workout";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

export const calculateComplianceSchema = z.strictObject({ executionId: id });

// ---------------------------------------------------------------------------
// CalculateWorkoutCompliance (T207)
// ---------------------------------------------------------------------------

export class CalculateWorkoutCompliance {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(raw: unknown) {
    const input = calculateComplianceSchema.parse(raw);
    const now = this.clock();

    return this.db.$transaction(async (tx) => {
      const data = await loadExecutionWithSnapshot(tx, input.executionId);
      const result = calculateCompliance(data.snapshot, data.execution);

      const compliance = createWorkoutCompliance({
        id: randomUUID(),
        workoutExecutionId: data.execution.id,
        workoutAssignmentId: data.execution.workoutAssignmentId,
        athleteId: data.execution.athleteId,
        overallScore: result.overallScore,
        breakdown: result.breakdown,
        strategyKey: result.strategyKey,
        algorithmVersion: COMPLIANCE_ALGORITHM_VERSION,
        calculatedAt: now,
      }, now);

      // Idempotent: upsert keyed on executionId unique constraint
      return tx.workoutCompliance.upsert({
        where: { workoutExecutionId: input.executionId },
        create: compliance,
        update: {
          overallScore: compliance.overallScore,
          breakdown: compliance.breakdown as Record<string, number>,
          strategyKey: compliance.strategyKey,
          algorithmVersion: compliance.algorithmVersion,
          calculatedAt: compliance.calculatedAt,
          updatedAt: now,
        },
      });
    });
  }
}

// ---------------------------------------------------------------------------
// RecalculateWorkoutCompliance (T208)
// ---------------------------------------------------------------------------

/** Forces re-computation. Same as Calculate but always overwrites existing record. */
export class RecalculateWorkoutCompliance {
  private readonly calc: CalculateWorkoutCompliance;

  constructor(db: PrismaClient, clock: () => Date = () => new Date()) {
    this.calc = new CalculateWorkoutCompliance(db, clock);
  }

  /** Re-run compliance calculation for a single execution. */
  async execute(raw: unknown) {
    // Delegate — upsert in CalculateWorkoutCompliance handles idempotency.
    return this.calc.execute(raw);
  }

  /** Re-run compliance for all executions of a given assignment (bulk recalculation). */
  async executeForAssignment(assignmentId: string, db: PrismaClient) {
    const executions = await db.workoutExecution.findMany({
      where: {
        workoutAssignmentId: assignmentId,
        matchStatus: { in: [WorkoutMatchStatus.CONFIRMED, WorkoutMatchStatus.OVERRIDDEN, WorkoutMatchStatus.AUTO_MATCHED] },
      },
      select: { id: true },
    });
    const results = await Promise.allSettled(executions.map((e) => this.calc.execute({ executionId: e.id })));
    return {
      total: results.length,
      succeeded: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  }
}

// ---------------------------------------------------------------------------
// T209 — Hook: called after ConfirmWorkoutMatch or OverrideWorkoutMatch
// ---------------------------------------------------------------------------

/**
 * Call this immediately after a WorkoutExecution is confirmed or overridden
 * so the compliance record is always fresh when a coach views results.
 * Fire-and-forget — errors are swallowed to avoid blocking the confirm flow.
 */
export async function triggerComplianceCalculation(db: PrismaClient, executionId: string, clock?: () => Date): Promise<void> {
  try {
    const calc = new CalculateWorkoutCompliance(db, clock ?? (() => new Date()));
    await calc.execute({ executionId });
  } catch {
    // Intentional: compliance calculation failure must not block the match flow.
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function loadExecutionWithSnapshot(tx: Tx, executionId: string): Promise<{ execution: WorkoutExecution; snapshot: WorkoutSnapshot }> {
  const row = await tx.workoutExecution.findUnique({
    where: { id: executionId },
    include: {
      assignment: {
        include: {
          workout: { select: { snapshotPayload: true } },
        },
      },
    },
  });

  if (!row) throw new SchoolError("EXECUTION_NOT_FOUND", "Execução não encontrada.", 404);

  const execution: WorkoutExecution = {
    id: row.id,
    workoutAssignmentId: row.workoutAssignmentId,
    athleteId: row.athleteId,
    source: row.source,
    externalId: row.externalId,
    sportType: row.sportType,
    startedAt: row.startedAt,
    durationSeconds: row.durationSeconds,
    movingSeconds: row.movingSeconds,
    distanceMeters: row.distanceMeters,
    averageHeartRate: row.averageHeartRate,
    maxHeartRate: row.maxHeartRate,
    averageSpeed: row.averageSpeed,
    elevationGain: row.elevationGain,
    averagePower: row.averagePower,
    matchScore: row.matchScore,
    matchStatus: row.matchStatus as WorkoutExecution["matchStatus"],
    activityPayload: row.activityPayload as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  const snapshot = row.assignment.workout.snapshotPayload as unknown as WorkoutSnapshot;
  return { execution, snapshot };
}
