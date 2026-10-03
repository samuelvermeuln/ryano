/**
 * SAM-33 — the one hook every provider calls after persisting an `Activity`.
 *
 * Provider-agnostic on purpose: it takes the persisted row (whatever module
 * wrote it — Garmin, Strava, or a provider that does not exist yet) and asks
 * the school module whether a prescription matches. Adding a provider means
 * calling this once after its upsert; nothing here changes.
 *
 * Guarantees:
 * - Never throws. A sync must finish even when matching fails (the result
 *   carries the reason, and a structured log is emitted without PII).
 * - Idempotent across re-syncs: an activity that already has an execution
 *   (any status, matched by `(athleteId, source, externalId)`) is skipped, so
 *   the same session never produces two executions nor two "unplanned" rows.
 * - A strong score creates an AUTO_MATCHED execution; a weak one a PENDING
 *   execution for the athlete to confirm; a different sport never matches
 *   (`computeMatchScore` hard-blocks it) — the activity then stays "unplanned".
 * - SAM-39: a copy of a session already persisted from another connection
 *   (`duplicateOfActivityId` set by `markDuplicateSession`) is skipped, so the
 *   mirror never creates a second execution nor a second "unplanned" item.
 */
import type { Activity, PrismaClient } from "@prisma/client";
import { logIntegrationEvent } from "@/modules/shared/integrations/observability/log";
import type { ProviderId } from "@/modules/shared/integrations/types";
import type { ExecutionDetailLoader } from "./calculate-workout-compliance";
import { TriggerWorkoutMatching, type TriggerMatchingResult } from "./trigger-workout-matching";
import { notifyUnplannedActivity } from "./unplanned-activity-notice";

export const ACTIVITY_MATCHING_OPERATION = "activity_matching";

export type PersistedActivity = Pick<
  Activity,
  | "id" | "userId" | "wearableConnectionId" | "provider" | "externalId" | "sportType" | "providerSportType"
  | "startedAt" | "durationSeconds" | "movingSeconds" | "distanceMeters" | "averageHeartRate" | "maxHeartRate"
  | "averageSpeed" | "elevationGain" | "averagePower" | "rawPayload"
> & {
  /** SAM-39 — a mirror of a session already persisted from another connection is never matched on its own. */
  duplicateOfActivityId?: string | null;
};

export type MatchPersistedActivityOptions = {
  clock?: () => Date;
  /** SAM-19 — lap reader for the compliance formula; the provider module injects its own. */
  loadDetail?: ExecutionDetailLoader | null;
};

type MatchingDb = PrismaClient;

function orUndefined(value: number | null): number | undefined {
  return value === null ? undefined : value;
}

/** Executions are keyed by a free `source` string; providers write the enum value, older rows may be lowercase. */
export function executionSourceVariants(provider: string): string[] {
  const upper = provider.toUpperCase();
  const lower = provider.toLowerCase();
  return upper === lower ? [upper] : [upper, lower];
}

export async function matchPersistedActivity(
  db: MatchingDb,
  activity: PersistedActivity,
  options: MatchPersistedActivityOptions = {},
): Promise<TriggerMatchingResult> {
  const provider = activity.provider as ProviderId;
  try {
    if (activity.duplicateOfActivityId) {
      return { skipped: true, reason: "DUPLICATE_SESSION" };
    }
    const existing = await db.workoutExecution.findFirst({
      where: {
        athleteId: activity.userId,
        externalId: activity.externalId,
        source: { in: executionSourceVariants(activity.provider) },
      },
      select: { id: true },
    });
    if (existing) {
      return { skipped: true, reason: "ALREADY_LINKED" };
    }

    const raw = activity.rawPayload && typeof activity.rawPayload === "object" && !Array.isArray(activity.rawPayload)
      ? (activity.rawPayload as Record<string, unknown>)
      : undefined;

    const result = await new TriggerWorkoutMatching(db, options.clock, options.loadDetail ?? null)
      .execute(activity.userId, {
        source: activity.provider,
        externalId: activity.externalId,
        sportType: activity.sportType,
        providerSportType: activity.providerSportType ?? activity.sportType,
        startedAt: activity.startedAt,
        durationSeconds: orUndefined(activity.durationSeconds),
        movingSeconds: orUndefined(activity.movingSeconds),
        distanceMeters: orUndefined(activity.distanceMeters),
        averageHeartRate: orUndefined(activity.averageHeartRate),
        maxHeartRate: orUndefined(activity.maxHeartRate),
        averageSpeed: orUndefined(activity.averageSpeed),
        elevationGain: orUndefined(activity.elevationGain),
        averagePower: orUndefined(activity.averagePower),
        raw,
      });

    // SAM-62 — an extra activity stays visible and the current coaches hear about it once.
    if (result.reason === "NO_CANDIDATES") {
      await notifyUnplannedActivity(db, activity, (options.clock ?? (() => new Date()))()).catch(() => 0);
    }

    logIntegrationEvent("info", "Activity matching evaluated", {
      provider,
      operation: ACTIVITY_MATCHING_OPERATION,
      status: result.skipped ? (result.reason?.split(":")[0] ?? "skipped") : (result.matchStatus ?? "matched"),
      connectionId: activity.wearableConnectionId,
      activityId: activity.id,
      matchScore: result.matchScore,
    });

    return result;
  } catch (error) {
    // The sync that persisted the activity must not fail because of matching.
    logIntegrationEvent("warn", "Activity matching unavailable", {
      provider,
      operation: ACTIVITY_MATCHING_OPERATION,
      status: "error",
      connectionId: activity.wearableConnectionId,
      activityId: activity.id,
      errorName: error instanceof Error ? error.name : "Error",
    });
    return { skipped: true, reason: "MATCHING_ERROR" };
  }
}
