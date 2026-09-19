/**
 * T179 — Integration hook: trigger automatic workout matching when a new
 * provider activity arrives.
 *
 * This service is the single call-site that provider sync jobs and webhook
 * handlers invoke after persisting a new activity. It keeps the school module
 * decoupled from providers: callers only pass a plain `ActivitySummary` and the
 * athlete's user ID; the school module never imports Garmin or Strava packages.
 *
 * Behaviour:
 *  1. Find open assignments that could match this activity (FindMatchingWorkout).
 *  2. Take the best candidate (highest score ≥ STRONG_MATCH_THRESHOLD).
 *  3. Call MatchActivityToWorkout to create a WorkoutExecution (AUTO_MATCHED).
 *  4. If no STRONG match exists but a WEAK one does, create the execution as
 *     PENDING so the athlete sees it for manual confirmation.
 *  5. If the school module is disabled or no assignments are found, return early
 *     silently — provider jobs must never fail because of school matching.
 */
import { type PrismaClient } from "@prisma/client";
import { WorkoutMatchStatus } from "../domain/enums";
import { isSchoolModuleEnabled } from "../config/feature-flag";
import type { ActivitySummary } from "../domain/training-activity-reader";
import { FindMatchingWorkout } from "./find-matching-workout";
import { MatchActivityToWorkout } from "./match-activity-to-workout";

export interface TriggerMatchingResult {
  skipped: boolean;
  reason?: string;
  matched?: boolean;
  workoutAssignmentId?: string;
  matchStatus?: WorkoutMatchStatus;
  matchScore?: number;
}

export class TriggerWorkoutMatching {
  private readonly findMatching: FindMatchingWorkout;
  private readonly matchActivity: MatchActivityToWorkout;

  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {
    this.findMatching = new FindMatchingWorkout(db);
    this.matchActivity = new MatchActivityToWorkout(db, clock);
  }

  /**
   * Called by provider jobs/webhooks after a new activity is saved.
   * Never throws — errors are swallowed and returned in the result so
   * the calling job can log without failing the broader sync.
   */
  async execute(athleteUserId: string, activity: ActivitySummary): Promise<TriggerMatchingResult> {
    try {
      if (!isSchoolModuleEnabled()) {
        return { skipped: true, reason: "SCHOOL_MODULE_DISABLED" };
      }

      const candidates = await this.findMatching.execute({
        athleteId: athleteUserId,
        source: activity.source,
        externalId: activity.externalId,
        sportType: activity.sportType,
        startedAt: activity.startedAt,
        durationSeconds: activity.durationSeconds ?? null,
        distanceMeters: activity.distanceMeters ?? null,
      });

      if (candidates.length === 0) {
        return { skipped: true, reason: "NO_CANDIDATES" };
      }

      const best = candidates[0]; // already sorted by score desc

      const execution = await this.matchActivity.execute({
        workoutAssignmentId: best.workoutAssignmentId,
        athleteId: athleteUserId,
        source: activity.source,
        externalId: activity.externalId,
        sportType: activity.sportType,
        startedAt: activity.startedAt,
        durationSeconds: activity.durationSeconds ?? null,
        movingSeconds: activity.movingSeconds ?? null,
        distanceMeters: activity.distanceMeters ?? null,
        averageHeartRate: activity.averageHeartRate ?? null,
        maxHeartRate: activity.maxHeartRate ?? null,
        averageSpeed: activity.averageSpeed ?? null,
        elevationGain: activity.elevationGain ?? null,
        averagePower: activity.averagePower ?? null,
        activityPayload: (activity.raw ?? {}) as Record<string, unknown>,
      });

      return {
        skipped: false,
        matched: true,
        workoutAssignmentId: best.workoutAssignmentId,
        matchStatus: execution.matchStatus as WorkoutMatchStatus,
        matchScore: execution.matchScore,
      };
    } catch (error) {
      // Never propagate — provider jobs must complete even if school matching fails.
      const message = error instanceof Error ? error.message : String(error);
      return { skipped: true, reason: `MATCHING_ERROR: ${message}` };
    }
  }
}
