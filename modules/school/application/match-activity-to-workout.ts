/**
 * T174 — MatchActivityToWorkout
 *
 * Creates (or idempotently updates) a WorkoutExecution record that links a
 * provider activity to a WorkoutAssignment. Called automatically when a new
 * activity is ingested (T179) or manually when a user picks an assignment.
 *
 * Idempotency (T180): the unique constraint on (workoutAssignmentId, source,
 * externalId) ensures that replaying the same event produces exactly one row.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus, WorkoutMatchStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createWorkoutExecution } from "../domain/workout-execution";
import { computeMatchScore, STRONG_MATCH_THRESHOLD } from "../domain/workout-matching";
import type { ActivitySummary } from "../domain/training-activity-reader";
import { schoolLogger } from "../infrastructure/logger";
import { schoolMetrics } from "../infrastructure/metrics";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

export const matchActivityToWorkoutSchema = z.strictObject({
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

export class MatchActivityToWorkout {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(raw: unknown) {
    const log = schoolLogger("match-activity-to-workout");
    const input = matchActivityToWorkoutSchema.parse(raw);

    log.info("matching_start", { workoutAssignmentId: input.workoutAssignmentId, source: input.source, externalId: input.externalId, correlationId: log.correlationId });

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
        if (assignment.athleteId !== input.athleteId) throw new SchoolError("FORBIDDEN", "Atividade não pertence a este atleta.", 403);

        const cancellableStatuses = new Set<string>([
          WorkoutAssignmentStatus.CANCELLED,
          WorkoutAssignmentStatus.COMPLETED,
        ]);
        if (cancellableStatuses.has(assignment.status)) {
          throw new SchoolError("WORKOUT_INVALID_TRANSITION", "A prescrição não pode receber execuções neste estado.", 409);
        }

        const workout = assignment.workout;
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
          workout: {
            sportType: workout.sportType,
            scheduledDate: workout.scheduledDate,
            scheduledStartAt: workout.scheduledStartAt,
          },
          prescribedDurationSeconds,
          prescribedDistanceMeters,
          blockCount: workout.blocks.length,
          activity,
        });

        const matchStatus = composite >= STRONG_MATCH_THRESHOLD ? WorkoutMatchStatus.AUTO_MATCHED : WorkoutMatchStatus.PENDING;
        const now = this.clock();

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
          matchStatus,
          activityPayload: input.activityPayload,
        }, now);

        const saved = await tx.workoutExecution.create({ data: { ...execution, activityPayload: execution.activityPayload as Prisma.InputJsonValue } });

        // Promote to AVAILABLE if still SCHEDULED and a match was recorded.
        if (assignment.status === WorkoutAssignmentStatus.SCHEDULED) {
          await tx.workoutAssignment.update({
            where: { id: input.workoutAssignmentId },
            data: { status: WorkoutAssignmentStatus.AVAILABLE, updatedAt: now },
          });
        }

        const outcome = matchStatus === WorkoutMatchStatus.AUTO_MATCHED ? "auto_matched" : "unmatched";
        log.info("matching_complete", { executionId: saved.id, matchStatus, matchScore: composite, outcome, correlationId: log.correlationId });
        schoolMetrics.matchingOutcome({ outcome, matchScore: composite, athleteId: input.athleteId, correlationId: log.correlationId });
        return saved;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Idempotent: activity already matched to this assignment — return existing.
        const existing = await this.db.workoutExecution.findFirst({
          where: { workoutAssignmentId: input.workoutAssignmentId, source: input.source, externalId: input.externalId },
        });
        if (existing) {
          log.info("matching_idempotent", { executionId: existing.id, correlationId: log.correlationId });
          return existing;
        }
      }
      schoolMetrics.matchingError(String(error), log.correlationId);
      log.error("matching_failed", { error: String(error), correlationId: log.correlationId });
      throw error;
    }
  }
}
