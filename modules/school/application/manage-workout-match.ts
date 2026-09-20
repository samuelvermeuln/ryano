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
import { computeMatchScore, STRONG_MATCH_THRESHOLD } from "../domain/workout-matching";
import { createWorkoutExecution } from "../domain/workout-execution";
import type { ActivitySummary } from "../domain/training-activity-reader";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

// ---------------------------------------------------------------------------
// ConfirmWorkoutMatch (T175)
// ---------------------------------------------------------------------------

export const confirmWorkoutMatchSchema = z.strictObject({ executionId: id });

/** Transitions AUTO_MATCHED → CONFIRMED. Only the athlete or their assigning coach may confirm. */
export class ConfirmWorkoutMatch {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = confirmWorkoutMatchSchema.parse(raw);

    return this.db.$transaction(async (tx) => {
      const execution = await tx.workoutExecution.findUnique({
        where: { id: input.executionId },
        include: { assignment: { select: { athleteId: true, coachId: true } } },
      });
      if (!execution) throw new SchoolError("EXECUTION_NOT_FOUND", "Execução não encontrada.", 404);

      const isAthlete = execution.assignment.athleteId === actor.data;
      const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true } });
      const isCoach = coach?.id === execution.assignment.coachId;
      if (!isAthlete && !isCoach) throw new SchoolError("FORBIDDEN", "Apenas o atleta ou o professor responsável pode confirmar esta execução.", 403);

      if (execution.matchStatus === WorkoutMatchStatus.CONFIRMED) {
        return execution; // idempotent
      }
      if (execution.matchStatus !== WorkoutMatchStatus.AUTO_MATCHED && execution.matchStatus !== WorkoutMatchStatus.PENDING) {
        throw new SchoolError("EXECUTION_INVALID_TRANSITION", "A execução não pode ser confirmada neste estado.", 409);
      }

      const now = this.clock();
      return tx.workoutExecution.update({
        where: { id: input.executionId },
        data: { matchStatus: WorkoutMatchStatus.CONFIRMED, updatedAt: now },
      });
    });
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
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = overrideWorkoutMatchSchema.parse(raw);

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
                blocks: { select: { durationS: true, distanceM: true } },
              },
            },
          },
        });
        if (!assignment) throw new SchoolError("STORE_NOT_FOUND", "Prescrição não encontrada.", 404);
        if (assignment.athleteId !== input.athleteId) throw new SchoolError("FORBIDDEN", "A prescrição não pertence a este atleta.", 403);

        // Only the assigning coach or the athlete may override
        const isAthlete = actor.data === assignment.athleteId;
        const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true } });
        if (!isAthlete && coach?.id !== assignment.coachId) {
          throw new SchoolError("FORBIDDEN", "Apenas o atleta ou o professor responsável pode substituir esta execução.", 403);
        }

        const now = this.clock();

        // Supersede previous non-confirmed executions
        await tx.workoutExecution.updateMany({
          where: {
            workoutAssignmentId: input.workoutAssignmentId,
            matchStatus: { in: [WorkoutMatchStatus.AUTO_MATCHED, WorkoutMatchStatus.PENDING] },
          },
          data: { matchStatus: WorkoutMatchStatus.NO_MATCH, updatedAt: now },
        });

        const workout = assignment.workout;
        if (!workout) throw new SchoolError("ASSIGNMENT_NO_WORKOUT", "Prescrição sem treino associado não pode ser avaliada.", 409);
        const prescribedDurationSeconds = workout.blocks.reduce((s, b) => s + (b.durationS ?? 0), 0) || null;
        const prescribedDistanceMeters = workout.blocks.reduce((s, b) => s + Number(b.distanceM ?? 0), 0) || null;

        const activity: ActivitySummary = {
          source: input.source,
          externalId: input.externalId,
          sportType: input.sportType,
          providerSportType: input.sportType,
          startedAt: input.startedAt,
          durationSeconds: input.durationSeconds ?? undefined,
          distanceMeters: input.distanceMeters ?? undefined,
        };

        const { composite } = computeMatchScore({
          workout: { sportType: workout.sportType, scheduledDate: workout.scheduledDate, scheduledStartAt: workout.scheduledStartAt },
          prescribedDurationSeconds,
          prescribedDistanceMeters,
          blockCount: workout.blocks.length,
          activity,
        });

        const execution = createWorkoutExecution({
          id: randomUUID(),
          workoutAssignmentId: input.workoutAssignmentId,
          athleteId: input.athleteId,
          source: input.source,
          externalId: input.externalId,
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

        return tx.workoutExecution.create({ data: { ...execution, activityPayload: execution.activityPayload as Prisma.InputJsonValue } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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

/** Removes an execution link. The assignment reverts to SCHEDULED if no other active execution remains. */
export class UnmatchActivity {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = unmatchActivitySchema.parse(raw);

    return this.db.$transaction(async (tx) => {
      const execution = await tx.workoutExecution.findUnique({
        where: { id: input.executionId },
        include: { assignment: { select: { athleteId: true, coachId: true, status: true } } },
      });
      if (!execution) throw new SchoolError("EXECUTION_NOT_FOUND", "Execução não encontrada.", 404);

      // CONFIRMED executions may not be silently removed
      if (execution.matchStatus === WorkoutMatchStatus.CONFIRMED) {
        throw new SchoolError("EXECUTION_INVALID_TRANSITION", "Execuções confirmadas não podem ser desvinculadas.", 409);
      }

      const isAthlete = execution.assignment.athleteId === actor.data;
      const coach = await tx.coachProfile.findUnique({ where: { userId: actor.data }, select: { id: true } });
      if (!isAthlete && coach?.id !== execution.assignment.coachId) {
        throw new SchoolError("FORBIDDEN", "Apenas o atleta ou o professor responsável pode desvincular esta execução.", 403);
      }

      await tx.workoutExecution.delete({ where: { id: input.executionId } });

      // Revert assignment to SCHEDULED if no other active execution exists
      const now = this.clock();
      const remaining = await tx.workoutExecution.count({
        where: {
          workoutAssignmentId: execution.workoutAssignmentId,
          matchStatus: { in: [WorkoutMatchStatus.AUTO_MATCHED, WorkoutMatchStatus.CONFIRMED, WorkoutMatchStatus.OVERRIDDEN, WorkoutMatchStatus.PENDING] },
        },
      });
      if (remaining === 0 && execution.assignment.status === WorkoutAssignmentStatus.AVAILABLE) {
        await tx.workoutAssignment.update({
          where: { id: execution.workoutAssignmentId },
          data: { status: WorkoutAssignmentStatus.SCHEDULED, updatedAt: now },
        });
      }

      return { unmatched: true, executionId: input.executionId };
    });
  }
}
