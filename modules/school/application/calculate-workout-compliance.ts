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
import { type Activity, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { ExecutionDetail } from "../domain/compliance-strategy";
import { WorkoutMatchStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { COMPLIANCE_ALGORITHM_VERSION, createWorkoutCompliance } from "../domain/workout-compliance";
import { calculateCompliance } from "../domain/workout-compliance-service";
import type { WorkoutExecution } from "../domain/workout-execution";
import type { WorkoutSnapshot } from "../domain/workout";
import { schoolLogger } from "../infrastructure/logger";
import { schoolMetrics } from "../infrastructure/metrics";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

export const calculateComplianceSchema = z.strictObject({ executionId: id });

/**
 * SAM-19 — how the laps behind a linked activity are read, injected by the
 * app layer (the provider modules own it). Optional: without it the formula
 * falls back to the summary metrics, which is still version 2.
 */
export type ExecutionDetailLoader = (activity: Activity) => Promise<ExecutionDetail | null>;

// ---------------------------------------------------------------------------
// CalculateWorkoutCompliance (T207)
// ---------------------------------------------------------------------------

export class CalculateWorkoutCompliance {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
    private readonly loadDetail: ExecutionDetailLoader | null = null,
  ) {}

  async execute(raw: unknown) {
    const log = schoolLogger("calculate-workout-compliance");
    const input = calculateComplianceSchema.parse(raw);
    const now = this.clock();

    log.info("compliance_calc_start", { executionId: input.executionId, correlationId: log.correlationId });

    try {
      // Reads and the (possibly slow) provider lap read happen outside any
      // transaction: the only write is one upsert, atomic on its own, and an
      // interactive transaction would time out waiting on a provider.
      const data = await loadExecutionWithSnapshot(this.db, input.executionId);
      // Laps never block the formula: a provider failure means "score from
      // the summary", not "no score".
      let detail: ExecutionDetail | null = null;
      if (data.activity && this.loadDetail) {
        try {
          detail = await this.loadDetail(data.activity);
        } catch {
          detail = null;
        }
      }
      const result = calculateCompliance(data.snapshot, data.execution, detail ?? undefined);

      // SAM-48 — nothing measurable (no duration, distance, intensity…):
      // "sem dados", not a score of 0. A previous record for this execution,
      // computed before the data changed, would now be a lie — drop it.
      if (result.overallScore === null) {
        await this.db.workoutCompliance.deleteMany({ where: { workoutExecutionId: input.executionId } });
        log.info("compliance_calc_no_data", { executionId: input.executionId, correlationId: log.correlationId });
        return null;
      }

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
      const saved = await this.db.workoutCompliance.upsert({
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
      log.info("compliance_calc_complete", { executionId: input.executionId, overallScore: saved.overallScore, correlationId: log.correlationId });
      schoolMetrics.complianceScore({ overallScore: saved.overallScore, sportType: saved.strategyKey, athleteId: saved.athleteId, correlationId: log.correlationId });
      return saved;
    } catch (error) {
      schoolMetrics.complianceError(String(error), log.correlationId);
      log.error("compliance_calc_failed", { executionId: input.executionId, error: String(error), correlationId: log.correlationId });
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// RecalculateWorkoutCompliance (T208)
// ---------------------------------------------------------------------------

/** Forces re-computation. Same as Calculate but always overwrites existing record. */
export class RecalculateWorkoutCompliance {
  private readonly calc: CalculateWorkoutCompliance;

  constructor(db: PrismaClient, clock: () => Date = () => new Date(), loadDetail: ExecutionDetailLoader | null = null) {
    this.calc = new CalculateWorkoutCompliance(db, clock, loadDetail);
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
 * Called by the match flow (SAM-19: auto-match, confirm, override) right after
 * its transaction commits, so the compliance record exists the moment a coach
 * opens the workout. Awaited, so the caller's response already reflects it;
 * errors are swallowed because a scoring failure must never undo a match.
 */
export async function triggerComplianceCalculation(
  db: PrismaClient,
  executionId: string,
  clock?: () => Date,
  loadDetail: ExecutionDetailLoader | null = null,
): Promise<void> {
  try {
    const calc = new CalculateWorkoutCompliance(db, clock ?? (() => new Date()), loadDetail);
    await calc.execute({ executionId });
  } catch {
    // Intentional: compliance calculation failure must not block the match flow.
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadExecutionWithSnapshot(
  db: Pick<PrismaClient, "workoutExecution">,
  executionId: string,
): Promise<{ execution: WorkoutExecution; snapshot: WorkoutSnapshot; activity: Activity | null }> {
  const row = await db.workoutExecution.findUnique({
    where: { id: executionId },
    include: {
      assignment: {
        include: {
          workout: { select: { snapshotPayload: true } },
        },
      },
      // SAM-19 — the linked activity, for the lap-level reading of the formula.
      activity: true,
    },
  });

  if (!row) throw new SchoolError("EXECUTION_NOT_FOUND", "Execução não encontrada.", 404);

  const execution: WorkoutExecution = {
    id: row.id,
    workoutAssignmentId: row.workoutAssignmentId,
    athleteId: row.athleteId,
    source: row.source,
    externalId: row.externalId,
    activityId: row.activityId,
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

  if (!row.assignment.workout) throw new Error(`ASSIGNMENT_NO_WORKOUT: execution ${executionId} has no workout`);
  const snapshot = row.assignment.workout.snapshotPayload as unknown as WorkoutSnapshot;
  return { execution, snapshot, activity: row.activity ?? null };
}
