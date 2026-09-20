/**
 * T173 — FindMatchingWorkout
 *
 * Given an incoming activity, finds the best-matching open WorkoutAssignment
 * for the athlete. Returns the top candidate(s) with their match scores so
 * the caller can decide whether to create a WorkoutExecution automatically
 * (AUTO_MATCHED) or surface to the user for confirmation.
 */
import { type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus, WorkoutMatchStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import type { ActivitySummary } from "../domain/training-activity-reader";
import { computeMatchScore, STRONG_MATCH_THRESHOLD, WEAK_MATCH_THRESHOLD } from "../domain/workout-matching";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

export const findMatchingWorkoutSchema = z.strictObject({
  athleteId: id,
  source: z.string().min(1).max(50),
  externalId: z.string().min(1).max(256),
  sportType: z.string().min(1).max(100),
  startedAt: z.union([z.iso.datetime(), z.date()]).transform((v) => new Date(v)),
  durationSeconds: z.number().int().nonnegative().nullish().transform((v) => v ?? null),
  distanceMeters: z.number().nonnegative().nullish().transform((v) => v ?? null),
});

export type FindMatchingWorkoutInput = z.input<typeof findMatchingWorkoutSchema>;

export interface MatchCandidate {
  workoutAssignmentId: string;
  workoutId: string;
  matchScore: number;
  matchStatus: WorkoutMatchStatus;
}

/** Look-ahead window: search assignments scheduled within ±3 days of activity. */
const WINDOW_DAYS = 3;

export class FindMatchingWorkout {
  constructor(private readonly db: PrismaClient) {}

  async execute(raw: unknown): Promise<MatchCandidate[]> {
    const input = findMatchingWorkoutSchema.parse(raw);

    const windowStart = new Date(input.startedAt.getTime() - WINDOW_DAYS * 86_400_000);
    const windowEnd = new Date(input.startedAt.getTime() + WINDOW_DAYS * 86_400_000);

    // Find open assignments within the window that haven't been matched yet.
    const assignments = await this.db.workoutAssignment.findMany({
      where: {
        athleteId: input.athleteId,
        status: { in: [WorkoutAssignmentStatus.SCHEDULED, WorkoutAssignmentStatus.AVAILABLE] },
        OR: [
          { scheduledAt: { gte: windowStart, lte: windowEnd } },
          { scheduledAt: null },
        ],
        executions: { none: { source: input.source, externalId: input.externalId } },
      },
      include: {
        workout: {
          select: {
            id: true,
            sportType: true,
            scheduledDate: true,
            scheduledStartAt: true,
            blocks: { select: { durationS: true, distanceM: true } },
          },
        },
      },
      take: 50,
    });

    if (assignments.length === 0) return [];

    const activity: ActivitySummary = {
      source: input.source,
      externalId: input.externalId,
      sportType: input.sportType,
      providerSportType: input.sportType,
      startedAt: input.startedAt,
      durationSeconds: input.durationSeconds ?? undefined,
      distanceMeters: input.distanceMeters ?? undefined,
    };

    const candidates: MatchCandidate[] = [];

    for (const assignment of assignments) {
      const workout = assignment.workout;
      const prescribedDurationSeconds = workout.blocks.reduce((sum, b) => sum + (b.durationS ?? 0), 0) || null;
      const prescribedDistanceMeters = workout.blocks.reduce((sum, b) => sum + Number(b.distanceM ?? 0), 0) || null;

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

      if (composite >= WEAK_MATCH_THRESHOLD) {
        candidates.push({
          workoutAssignmentId: assignment.id,
          workoutId: workout.id,
          matchScore: composite,
          matchStatus: composite >= STRONG_MATCH_THRESHOLD ? WorkoutMatchStatus.AUTO_MATCHED : WorkoutMatchStatus.PENDING,
        });
      }
    }

    // Sort by score descending so the caller always gets the best candidate first.
    return candidates.sort((a, b) => b.matchScore - a.matchScore);
  }
}
