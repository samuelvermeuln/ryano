/**
 * SAM-39 — Strava → `NormalizedActivityDetail` (ADR-005).
 *
 * Two calls at most per activity, both documented in the official API
 * reference (https://developers.strava.com/docs/reference/): `getLapsByActivityId`
 * (`GET /activities/{id}/laps`) and `getActivityStreams`
 * (`GET /activities/{id}/streams?keys=…&key_by_type=true`). Laps already
 * persisted by the sync (`metrics.stravaActivityDetails.laps`) are reused
 * instead of fetched again. The route polyline, start/end coordinates, elapsed/
 * moving time and average temperature come from the activity payload the sync
 * stored (`rawPayload`), with no call. Zones are NOT native on Strava (the
 * athlete-zones endpoint needs `profile:read_all`; the per-activity zones
 * endpoint is Summit-only), so they are derived by the core from the
 * heart-rate stream (`deriveHeartRateZoneSet`) and labelled as such.
 *
 * Every value is optional: what Strava does not send stays absent, never 0.
 * Rate limits: the client's limiter applies; a 429 propagates as
 * `StravaRateLimitExceededError` so the caller (sync/backfill) can stop and
 * resume later (https://developers.strava.com/docs/rate-limits/).
 */
import type { Activity } from "@prisma/client";
import type { StravaClient, StravaClientContext } from "@/modules/strava/api/client";
import type { StravaStreamSetObjectDto } from "@/modules/strava/api/dto/strava-stream";
import { getPersistedStravaActivityLaps } from "@/modules/strava/application/activities/strava-activity-laps-cache";
import { parseStravaLaps, type ParsedActivityLap } from "@/modules/strava/parsers/parse-strava-laps";
import { parseStravaStreams, type ParsedActivityStream } from "@/modules/strava/parsers/parse-strava-streams";
import {
  normalizedActivityDetailSchema,
  type NormalizedActivityDetail,
  type NormalizedLap,
  type NormalizedStream,
  type NormalizedStreamKey,
} from "@/modules/shared/activities/contracts";

/** Streams the rich detail ingests (official stream types; `latlng` and `temp` added to the screen's set). */
export const STRAVA_INGEST_STREAM_KEYS: readonly string[] = [
  "time", "distance", "latlng", "altitude", "heartrate", "cadence", "watts", "velocity_smooth", "temp",
];

const STREAM_TYPE_TO_KEY: Partial<Record<ParsedActivityStream["type"], NormalizedStreamKey>> = {
  time: "time",
  distance: "distance",
  altitude: "altitude",
  heartrate: "heartRate",
  cadence: "cadence",
  watts: "power",
  velocity_smooth: "speed",
  temp: "temperature",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function latLng(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2 && num(value[0]) !== null && num(value[1]) !== null
    ? [value[0] as number, value[1] as number]
    : null;
}

export function lapsFromParsed(laps: readonly ParsedActivityLap[]): NormalizedLap[] {
  return laps.map((lap, index) => ({
    lapNumber: lap.index > 0 ? lap.index : index + 1,
    startedAt: null,
    durationSeconds: lap.durationSeconds,
    movingSeconds: null,
    distanceMeters: lap.distanceMeters,
    averagePace: null,
    averageSpeed: lap.averageSpeed,
    averageHeartRate: lap.averageHeartRate,
    maxHeartRate: null,
    averageCadence: lap.averageCadence,
    averageStrokeRate: null,
    maxStrokeRate: null,
    averageDistancePerStroke: null,
    averagePower: lap.averageWatts,
    calories: null,
    averageTemperature: null,
  }));
}

export function streamsFromDto(dto: StravaStreamSetObjectDto): NormalizedStream[] {
  const source = { provider: "STRAVA" as const, kind: "native" as const };
  const streams: NormalizedStream[] = [];
  for (const parsed of parseStravaStreams(dto)) {
    const key = STREAM_TYPE_TO_KEY[parsed.type];
    if (!key) continue;
    streams.push({ key, values: parsed.values.map((value) => (Number.isFinite(value) ? value : null)), source });
  }
  const latlng = dto.latlng?.data;
  if (Array.isArray(latlng) && latlng.length > 0) {
    streams.push({ key: "latlng", values: latlng.map(latLng), source });
  }
  return streams;
}

/** Stats readable from the stored Strava payload (summary or detailed), no call needed. */
export function statsFromPayload(rawPayload: unknown): NormalizedActivityDetail["stats"] {
  const raw = asRecord(rawPayload) ?? {};
  const map = asRecord(raw.map);
  const start = latLng(raw.start_latlng);
  const end = latLng(raw.end_latlng);
  return normalizedActivityDetailSchema.shape.stats.parse({
    timerSeconds: num(raw.moving_time),
    elapsedSeconds: num(raw.elapsed_time),
    averageTemperature: num(raw.average_temp),
    routePolyline: typeof map?.summary_polyline === "string" && map.summary_polyline.length > 0 ? map.summary_polyline : null,
    startLatitude: start?.[0] ?? null,
    startLongitude: start?.[1] ?? null,
    endLatitude: end?.[0] ?? null,
    endLongitude: end?.[1] ?? null,
    subSportType: typeof raw.sport_type === "string" ? raw.sport_type : null,
  });
}

/** Pure composition of the canonical detail from what the two calls (or the cache) returned. */
export function buildStravaActivityDetail(input: {
  activity: Pick<Activity, "externalId" | "rawPayload">;
  laps: readonly ParsedActivityLap[];
  streams: StravaStreamSetObjectDto | null;
}): NormalizedActivityDetail {
  const laps = lapsFromParsed(input.laps);
  const streams = input.streams ? streamsFromDto(input.streams) : [];
  const stats = statsFromPayload(input.activity.rawPayload);
  const hasStats = Object.values(stats).some((value) => value !== null);
  return normalizedActivityDetailSchema.parse({
    provider: "STRAVA",
    externalId: input.activity.externalId,
    laps,
    zones: [],
    streams,
    stats,
    sources: {
      ...(laps.length > 0 ? { laps: { provider: "STRAVA", kind: "native" } } : {}),
      ...(streams.length > 0 ? { streams: { provider: "STRAVA", kind: "native" } } : {}),
      ...(hasStats ? { stats: { provider: "STRAVA", kind: "native" } } : {}),
    },
  });
}

/**
 * Fetches what is not yet stored and composes the detail. Errors from the
 * client (401/403/404/429/5xx) propagate: the caller decides whether to
 * degrade (sync keeps going) or stop (backfill on 429).
 */
export async function fetchStravaActivityDetail(
  client: Pick<StravaClient, "getActivityLaps" | "getActivityStreams">,
  ctx: StravaClientContext,
  activity: Pick<Activity, "externalId" | "rawPayload" | "metrics">,
): Promise<NormalizedActivityDetail> {
  const persistedLaps = getPersistedStravaActivityLaps(activity.metrics);
  const laps = persistedLaps ?? parseStravaLaps(await client.getActivityLaps(ctx, activity.externalId));
  const streams = await client.getActivityStreams(ctx, activity.externalId, { keys: STRAVA_INGEST_STREAM_KEYS });
  return buildStravaActivityDetail({ activity, laps, streams });
}
