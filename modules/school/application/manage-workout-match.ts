/**
 * T175 — ConfirmWorkoutMatch
 * T176 — OverrideWorkoutMatch
 * T177 — UnmatchActivity
 *
 * These use-cases govern the reconciliation lifecycle of a WorkoutExecution.
 *
 * ConfirmWorkoutMatch   — athlete or coach confirms an AUTO_MATCHED execution → CONFIRMED
 * OverrideWorkoutMatch  — replace the matched activity with a different one (OVERRIDDEN)
 * UnmatchActivity       — remove the link between an execution and an assignment
 *                         (back to PENDING on the assignment if no other execution exists)
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus, WorkoutMatchStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { buildMatchDetail } from "../domain/workout-matching";
import { createWorkoutExecution } from "../domain/workout-execution";
import type { ActivitySummary } from "../domain/training-activity-reader";
import { matchedActivityData, resolveActivityId } from "../infrastructure/activity-link";
import { recordMatchHistory, resolveMatchActor, unlinkExecution } from "./match-audit";
import { triggerComplianceCalculation, type ExecutionDetailLoader } from "./calculate-workout-compliance";
import { plannedTotalsOfRows } from "../domain/workout-structure";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

// ---------------------------------------------------------------------------
// ConfirmWorkoutMatch (T175)
// ---------------------------------------------------------------------------

export const confirmWorkoutMatchSchema = z.strictObject({ executionId: id });

/** Transitions AUTO_MATCHED → CONFIRMED. Only the athlete or their assigning coach may confirm. */
export class ConfirmWorkoutMatch {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
    /** SAM-19 — lap reader for the compliance formula, injected by the app layer. */
    private readonly loadDetail: ExecutionDetailLoader | null = null,
  ) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = confirmWorkoutMatchSchema.parse(raw);

    const confirmed = await this.confirm(actor.data, input.executionId);
    // SAM-19 — scored after the transaction commits (idempotent upsert, so a
    // re-confirmation or a prior auto-match score is simply refreshed).
    await triggerComplianceCalculation(this.db, confirmed.id, this.clock, this.loadDetail);
    return confirmed;
  }

  private confirm(actorId: string, executionId: string) {
    const input = { executionId };
    const actor = { data: actorId };
    return this.db.$transaction(async (tx) => {
      const execution = await tx.workoutExecution.findUnique({
        where: { id: input.executionId },
        include: { assignment: { select: { athleteId: true, coachId: true, schoolId: true, status: true } } },
      });
      if (!execution) throw new SchoolError("EXECUTION_NOT_FOUND", "Execução não encontrada.", 404);

      const now = this.clock();
      const kind = await resolveMatchActor(tx, actor.data, execution.assignment, now);

      if (execution.matchStatus === WorkoutMatchStatus.CONFIRMED) {
        return execution; // idempotent
      }
      // SAM-62 — an undone link can be redone ("refazer"): the same row comes back, with its trail.
      const relink = execution.matchStatus === WorkoutMatchStatus.NO_MATCH && execution.unlinkedAt !== null;
      if (execution.matchStatus !== WorkoutMatchStatus.AUTO_MATCHED && execution.matchStatus !== WorkoutMatchStatus.PENDING && !relink) {
        throw new SchoolError("EXECUTION_INVALID_TRANSITION", "A execução não pode ser confirmada neste estado.", 409);
      }

      const confirmed = await tx.workoutExecution.update({
        where: { id: input.executionId },
        data: { matchStatus: WorkoutMatchStatus.CONFIRMED, unlinkedAt: null, unlinkedByUserId: null, unlinkReason: null, updatedAt: now },
      });
      // SAM-17 — the confirmed execution is, by definition, the assignment's match.
      await tx.workoutAssignment.update({
        where: { id: execution.workoutAssignmentId },
        data: {
          ...matchedActivityData(confirmed, now),
          ...(relink && execution.assignment.status === WorkoutAssignmentStatus.SCHEDULED ? { status: WorkoutAssignmentStatus.AVAILABLE } : {}),
          updatedAt: now,
        },
      });
      await recordMatchHistory(tx, {
        assignmentId: execution.workoutAssignmentId, eventType: relink ? "MATCH_LINKED" : "MATCH_CONFIRMED", actorUserId: actor.data, now,
        payload: { executionId: execution.id, activityId: execution.activityId, by: kind, method: execution.matchMethod, score: execution.matchScore, relinked: relink },
      });
      return confirmed;
    }, { maxWait: 5_000, timeout: 20_000 });
  }
}

// ---------------------------------------------------------------------------
// OverrideWorkoutMatch (T176)
// ---------------------------------------------------------------------------

export const overrideWorkoutMatchSchema = z.strictObject({
  workoutAssignmentId: id,
  athleteId: id,
  source: z.string().min(1).max(50),
  externalId: z.string().min(1).max(256),
  sportType: z.string().min(1).max(100),
  startedAt: z.union([z.iso.datetime(), z.date()]).transform((v) => new Date(v)),
  durationSeconds: z.number().int().nonnegative().nullish().transform((v) => v ?? null),
  movingSeconds: z.number().int().nonnegative().nullish().transform((v) => v ?? null),
  distanceMeters: z.number().nonnegative().nullish().transform((v) => v ?? null),
  averageHeartRate: z.number().int().nonnegative().nullish().transform((v) => v ?? null),
  maxHeartRate: z.number().int().nonnegative().nullish().transform((v) => v ?? null),
  averageSpeed: z.number().nonnegative().nullish().transform((v) => v ?? null),
  elevationGain: z.number().nullish().transform((v) => v ?? null),
  averagePower: z.number().int().nonnegative().nullish().transform((v) => v ?? null),
  activityPayload: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Supersedes any existing AUTO_MATCHED/PENDING execution on an assignment with
 * a manually chosen activity. Previous executions for this assignment are set to
 * NO_MATCH; the new one is created as OVERRIDDEN.
 */
export class OverrideWorkoutMatch {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
    /** SAM-19 — lap reader for the compliance formula, injected by the app layer. */
    private readonly loadDetail: ExecutionDetailLoader | null = null,
  ) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = overrideWorkoutMatchSchema.parse(raw);

    const created = await this.override(actor.data, input);
    // SAM-19 — the chosen activity is the one that gets scored.
    await triggerComplianceCalculation(this.db, created.id, this.clock, this.loadDetail);
    return created;
  }

  private async override(actorId: string, input: z.infer<typeof overrideWorkoutMatchSchema>) {
    const actor = { data: actorId };
    try {
      return await this.db.$transaction(async (tx) => {
        const assignment = await tx.workoutAssignment.findUnique({
          where: { id: input.workoutAssignmentId },
          include: {
            workout: {
              select: {
                sportType: true,
                scheduledDate: true,
                scheduledStartAt: true,
                blocks: { select: { blockType: true, durationS: true, distanceM: true, repetitions: true, restPayload: true } },
              },
            },
          },
        });
        if (!assignment) throw new SchoolError("STORE_NOT_FOUND", "Prescrição não encontrada.", 404);
        if (assignment.athleteId !== input.athleteId) throw new SchoolError("FORBIDDEN", "A prescrição não pertence a este atleta.", 403);

        const now = this.clock();
        // Only the assigning coach (still with access) or the athlete may override.
        const kind = await resolveMatchActor(tx, actor.data, assignment, now);

        // Supersede previous non-confirmed executions — undone with their trail, never silently.
        const superseded = await tx.workoutExecution.findMany({
          where: {
            workoutAssignmentId: input.workoutAssignmentId,
            matchStatus: { in: [WorkoutMatchStatus.AUTO_MATCHED, WorkoutMatchStatus.PENDING] },
          },
        });
        for (const execution of superseded) {
          await unlinkExecution(tx, execution, { userId: actor.data, kind }, "substituída por outra atividade", now);
        }

        const workout = assignment.workout;
        if (!workout) throw new SchoolError("ASSIGNMENT_NO_WORKOUT", "Prescrição sem treino associado não pode ser avaliada.", 409);
        const totals = plannedTotalsOfRows(workout.blocks);
        const prescribedDurationSeconds = totals.durationSeconds;
        const prescribedDistanceMeters = totals.distanceMeters;

        const activity: ActivitySummary = {
          source: input.source,
          externalId: input.externalId,
          sportType: input.sportType,
          providerSportType: input.sportType,
          startedAt: input.startedAt,
          durationSeconds: input.durationSeconds ?? undefined,
          distanceMeters: input.distanceMeters ?? undefined,
        };

        const detail = buildMatchDetail({
          workout: { sportType: workout.sportType, scheduledDate: workout.scheduledDate, scheduledStartAt: workout.scheduledStartAt },
          prescribedDurationSeconds,
          prescribedDistanceMeters,
          blockCount: workout.blocks.length,
          activity,
        });
        const composite = detail.composite;

        const execution = createWorkoutExecution({
          id: randomUUID(),
          workoutAssignmentId: input.workoutAssignmentId,
          athleteId: input.athleteId,
          source: input.source,
          externalId: input.externalId,
          activityId: await resolveActivityId(tx, {
            source: input.source, externalId: input.externalId, athleteId: input.athleteId,
          }),
          sportType: input.sportType,
          startedAt: input.startedAt,
          durationSeconds: input.durationSeconds,
          movingSeconds: input.movingSeconds,
          distanceMeters: input.distanceMeters,
          averageHeartRate: input.averageHeartRate,
          maxHeartRate: input.maxHeartRate,
          averageSpeed: input.averageSpeed,
          elevationGain: input.elevationGain,
          averagePower: input.averagePower,
          matchScore: composite,
          matchStatus: WorkoutMatchStatus.OVERRIDDEN,
          activityPayload: input.activityPayload,
        }, now);

        const created = await tx.workoutExecution.create({
          data: {
            ...execution, activityPayload: execution.activityPayload as Prisma.InputJsonValue,
            matchDetail: detail as unknown as Prisma.InputJsonValue, matchMethod: kind === "coach" ? "COACH" : "ATHLETE", matchedByUserId: actor.data,
          },
        });
        // SAM-17 — the chosen activity replaces whatever the assignment pointed at.
        await tx.workoutAssignment.update({
          where: { id: input.workoutAssignmentId },
          data: { ...matchedActivityData(created, now), updatedAt: now },
        });
        await recordMatchHistory(tx, {
          assignmentId: input.workoutAssignmentId, eventType: "MATCH_LINKED", actorUserId: actor.data, now,
          payload: { executionId: created.id, activityId: created.activityId, method: created.matchMethod, mode: "replace", score: composite },
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_ASSIGN_CONFLICT", "Não foi possível substituir a execução. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// UnmatchActivity (T177)
// ---------------------------------------------------------------------------

export const unmatchActivitySchema = z.strictObject({
  executionId: id,
  reason: z.string().max(2000).optional(),
});

/**
 * SAM-62 — undoes a link WITHOUT deleting: the execution (and the activity,
 * the review and the feedback) stays, marked NO_MATCH with who/when/why, and
 * can be linked again. The assignment reverts to SCHEDULED if nothing remains.
 */
export class UnmatchActivity {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = unmatchActivitySchema.parse(raw);

    return this.db.$transaction(async (tx) => {
      const execution = await tx.workoutExecution.findUnique({
        where: { id: input.executionId },
        include: { assignment: { select: { athleteId: true, coachId: true, schoolId: true } } },
      });
      if (!execution) throw new SchoolError("EXECUTION_NOT_FOUND", "Execução não encontrada.", 404);

      const now = this.clock();
      const kind = await resolveMatchActor(tx, actor.data, execution.assignment, now);
      if (execution.matchStatus === WorkoutMatchStatus.NO_MATCH) {
        return { unmatched: true, executionId: input.executionId }; // already undone
      }
      await unlinkExecution(tx, execution, { userId: actor.data, kind }, input.reason?.trim() || null, now);
      return { unmatched: true, executionId: input.executionId };
    }, { maxWait: 5_000, timeout: 20_000 });
  }
}
