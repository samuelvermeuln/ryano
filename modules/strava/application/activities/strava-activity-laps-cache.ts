import type { Activity } from "@prisma/client";
import { Prisma } from "@prisma/client";

import type { StravaClient } from "@/modules/strava/api/client";
import { parseStravaLaps } from "@/modules/strava/parsers/parse-strava-laps";
import type { ParsedActivityLap } from "@/modules/strava/parsers/parse-strava-laps";
import { prisma } from "@/server/db";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Missing detail data means this activity has never had its Strava laps read.
 * An empty persisted array is a completed read for an activity without laps.
 */
export function needsStravaActivityLapBackfill(metrics: unknown) {
  const details = asRecord(asRecord(metrics)?.stravaActivityDetails);
  return !details || !Array.isArray(details.laps);
}

/** Returns persisted, normalized laps without contacting Strava. */
export function getPersistedStravaActivityLaps(metrics: unknown): ParsedActivityLap[] | null {
  const laps = asRecord(asRecord(metrics)?.stravaActivityDetails)?.laps;
  return Array.isArray(laps) ? laps as ParsedActivityLap[] : null;
}

/** Preserves rich lap data when a summary-only Strava sync updates metrics. */
export function preserveStravaActivityLapCache(
  incomingMetrics: unknown,
  existingMetrics: unknown,
) {
  const incoming = asRecord(incomingMetrics) ?? {};
  const existingDetails = asRecord(asRecord(existingMetrics)?.stravaActivityDetails);

  return existingDetails
    ? { ...incoming, stravaActivityDetails: existingDetails }
    : incoming;
}

/**
 * Persists the normalized Strava laps during sync. Report materialization only
 * reads this domain data and never contacts the provider.
 *
 * @returns the updated row (so the caller sees the cached laps without another
 * read) or `null` when the laps could not be fetched/persisted.
 */
export async function cacheStravaActivityLaps(
  activity: Pick<Activity, "id" | "provider" | "wearableConnectionId" | "externalId" | "metrics">,
  client: Pick<StravaClient, "getActivityLaps">,
): Promise<Activity | null> {
  if (activity.provider !== "STRAVA") return null;

  try {
    const laps = parseStravaLaps(await client.getActivityLaps({
      connectionId: activity.wearableConnectionId,
    }, activity.externalId));
    const metrics = asRecord(activity.metrics) ?? {};

    return await prisma.activity.update({
      where: { id: activity.id },
      data: {
        metrics: {
          ...metrics,
          stravaActivityDetails: { laps },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch {
    return null;
  }
}
