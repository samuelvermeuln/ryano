import type { Activity } from "@prisma/client";
import { WearableProvider } from "@prisma/client";

import { prisma } from "@/server/db";

export type ActivityForStravaSplitFallback = {
  sportType: string;
  startedAt: Date;
  distanceMeters: number | null;
  durationSeconds: number | null;
};

export type StravaFallbackCandidate = ActivityForStravaSplitFallback & {
  id: string;
  metrics: unknown;
};

const MAX_TIME_DELTA_MS = 5 * 60 * 1000;
const MAX_DISTANCE_DELTA_METERS = 100;
const MAX_DURATION_DELTA_SECONDS = 30;

function sportFamily(sportType: string) {
  const normalized = sportType.toLowerCase();
  if (normalized.includes("swim") || normalized.includes("nat") || normalized.includes("open-water")) return "swim";
  if (normalized.includes("cycl") || normalized.includes("bike") || normalized.includes("mtb")) return "bike";
  if (normalized.includes("run") || normalized.includes("corr")) return "run";
  return normalized;
}

function hasCompatibleMetric(
  left: number | null,
  right: number | null,
  tolerance: number,
) {
  return left !== null && right !== null && Math.abs(left - right) <= tolerance;
}

/**
 * Selects an unambiguous Strava representation of the same session. It never
 * merges activities: callers may use only the persisted lap payload and must
 * keep the resulting report explicitly labelled as Strava-sourced.
 */
export function selectEquivalentStravaActivity(
  primary: ActivityForStravaSplitFallback,
  candidates: readonly StravaFallbackCandidate[],
): StravaFallbackCandidate | null {
  const equivalents = candidates.filter((candidate) =>
    sportFamily(primary.sportType) === sportFamily(candidate.sportType)
    && Math.abs(primary.startedAt.getTime() - candidate.startedAt.getTime()) <= MAX_TIME_DELTA_MS
    && hasCompatibleMetric(primary.distanceMeters, candidate.distanceMeters, MAX_DISTANCE_DELTA_METERS)
    && hasCompatibleMetric(primary.durationSeconds, candidate.durationSeconds, MAX_DURATION_DELTA_SECONDS),
  );

  return equivalents.length === 1 ? equivalents[0] ?? null : null;
}

/** Finds one persisted Strava counterpart for a Garmin activity; never merges records. */
export async function findEquivalentPersistedStravaActivity(
  primary: ActivityForStravaSplitFallback & { userId: string },
): Promise<Activity | null> {
  const candidates = await prisma.activity.findMany({
    where: {
      userId: primary.userId,
      provider: WearableProvider.STRAVA,
      startedAt: {
        gte: new Date(primary.startedAt.getTime() - MAX_TIME_DELTA_MS),
        lte: new Date(primary.startedAt.getTime() + MAX_TIME_DELTA_MS),
      },
    },
  });

  return selectEquivalentStravaActivity(primary, candidates) as unknown as Activity | null;
}
