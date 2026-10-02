/**
 * SAM-39 — Garmin → `NormalizedActivityDetail` (ADR-005).
 *
 * The Garmin service already persists the activity summary (`metrics`) and the
 * split payloads (`metrics.garminActivityDetails`, `cacheGarminActivitySplits`),
 * so the canonical detail is built from what is stored — no extra API call:
 * - laps ← typedSplits | splits | splitSummaries (same precedence as the screen);
 * - zones ← `hrTimeInZone_1..5` / `powerTimeInZone_1..5` of the summary (native);
 * - stats ← swolf/strokes/training load/effects/body battery/temperature of the summary.
 * Streams are not available for this account type yet (capability `streams: false`).
 *
 * Every value is optional: what the summary does not carry stays absent.
 * Keys are the ones the existing Garmin reader already uses
 * (`garmin-activity-details.ts`), so the two never disagree.
 */
import type { Activity } from "@prisma/client";
import {
  normalizedActivityDetailSchema,
  type NormalizedActivityDetail,
  type NormalizedLap,
  type NormalizedZoneSet,
} from "@/modules/shared/activities/contracts";

const SPLIT_DURATION_KEYS = ["elapsedDuration", "duration", "movingDuration", "totalTimeInSeconds", "timeInSeconds"];
const SPLIT_MOVING_KEYS = ["movingDuration", "movingTimeInSeconds"];
const SPLIT_DISTANCE_KEYS = ["distance", "distanceInMeters", "totalDistanceInMeters", "lengthDistance"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((row): row is Record<string, unknown> => row !== null) : [];
}

function getNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getDate(record: Record<string, unknown>, keys: string[]): Date | null {
  for (const key of keys) {
    const value = record[key];
    if (value instanceof Date) return value;
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}

function lapsFromSplits(rows: Record<string, unknown>[]): NormalizedLap[] {
  return rows.flatMap((row, index): NormalizedLap[] => {
    const durationSeconds = getNumber(row, SPLIT_DURATION_KEYS);
    const distanceMeters = getNumber(row, SPLIT_DISTANCE_KEYS);
    if (durationSeconds === null && distanceMeters === null) return [];
    return [{
      lapNumber: index + 1,
      startedAt: getDate(row, ["startTimeGMT", "startTimeGmt", "startTimeLocal"]),
      durationSeconds,
      movingSeconds: getNumber(row, SPLIT_MOVING_KEYS),
      distanceMeters,
      averagePace: getNumber(row, ["averagePace", "pace"]),
      averageSpeed: getNumber(row, ["averageSpeed", "avgSpeed"]),
      averageHeartRate: getNumber(row, ["averageHR", "avgHr", "averageHeartRate", "averageHeartRateInBeatsPerMinute"]),
      maxHeartRate: getNumber(row, ["maxHR", "maxHr", "maxHeartRate", "maxHeartRateInBeatsPerMinute"]),
      averageCadence: getNumber(row, ["averageCadence", "averageRunningCadenceInStepsPerMinute"]),
      averageStrokeRate: getNumber(row, ["averageSwimCadenceInStrokesPerMinute", "averageStrokeRate"]),
      maxStrokeRate: getNumber(row, ["maxSwimCadenceInStrokesPerMinute"]),
      averageDistancePerStroke: getNumber(row, ["averageStrokeDistance", "avgStrokeDistance"]),
      averagePower: getNumber(row, ["averagePower", "avgPower"]),
      calories: getNumber(row, ["calories"]),
      averageTemperature: getNumber(row, ["averageTemperature", "avgTemperature"]),
    }];
  });
}

function zoneSetFromSummary(
  summary: Record<string, unknown>,
  prefix: "hrTimeInZone_" | "powerTimeInZone_",
  zoneType: NormalizedZoneSet["zoneType"],
): NormalizedZoneSet | null {
  const zones = [1, 2, 3, 4, 5].flatMap((zoneNumber) => {
    const seconds = getNumber(summary, [`${prefix}${zoneNumber}`]);
    return seconds === null ? [] : [{ zoneNumber, label: `Zona ${zoneNumber}`, lowerBound: null, upperBound: null, durationSeconds: Math.max(0, seconds) }];
  });
  if (zones.length === 0 || zones.every((zone) => zone.durationSeconds === 0)) return null;
  return { zoneType, source: { provider: "GARMIN", kind: "native" }, configurationRef: null, zones };
}

/** Builds the canonical detail of a Garmin activity from its stored summary and split cache. */
export function buildGarminActivityDetail(activity: Pick<Activity, "externalId" | "metrics">): NormalizedActivityDetail | null {
  const summary = asRecord(activity.metrics);
  if (!summary) return null;
  const persisted = asRecord(summary.garminActivityDetails);
  const splitSource = persisted
    ? [persisted.typedSplits, persisted.splits, persisted.splitSummaries].map(toRecordArray).find((rows) => rows.length > 0) ?? []
    : [];

  const laps = lapsFromSplits(splitSource);
  const zones = [
    zoneSetFromSummary(summary, "hrTimeInZone_", "HEART_RATE"),
    zoneSetFromSummary(summary, "powerTimeInZone_", "POWER"),
  ].filter((set): set is NormalizedZoneSet => set !== null);

  const energyImpact = getNumber(summary, ["differenceBodyBattery", "bodyBatteryImpact"]);
  const stats = {
    timerSeconds: getNumber(summary, ["duration"]),
    elapsedSeconds: getNumber(summary, ["elapsedDuration"]),
    caloriesResting: getNumber(summary, ["bmrCalories"]),
    estimatedSweatLossMl: getNumber(summary, ["waterEstimated"]),
    totalStrokes: getNumber(summary, ["strokes", "totalNumberOfStrokes"]),
    averageStrokeRate: getNumber(summary, ["averageSwimCadenceInStrokesPerMinute"]),
    maxStrokeRate: getNumber(summary, ["maxSwimCadenceInStrokesPerMinute"]),
    averageDistancePerStroke: getNumber(summary, ["averageStrokeDistance", "avgStrokeDistance"]),
    averageSwolf: getNumber(summary, ["averageSwolf"]),
    averageTemperature: getNumber(summary, ["averageTemperature"]),
    minTemperature: getNumber(summary, ["minTemperature"]),
    maxTemperature: getNumber(summary, ["maxTemperature"]),
    trainingLoad: getNumber(summary, ["activityTrainingLoad"]),
    aerobicEffect: getNumber(summary, ["aerobicTrainingEffect"]),
    aerobicEffectLabel: getString(summary, ["aerobicTrainingEffectMessage", "trainingEffectLabel"]),
    anaerobicEffect: getNumber(summary, ["anaerobicTrainingEffect"]),
    anaerobicEffectLabel: getString(summary, ["anaerobicTrainingEffectMessage"]),
    energyImpact,
    energyLabel: energyImpact === null ? null : "Body Battery",
    startLatitude: getNumber(summary, ["startLatitude"]),
    startLongitude: getNumber(summary, ["startLongitude"]),
    endLatitude: getNumber(summary, ["endLatitude"]),
    endLongitude: getNumber(summary, ["endLongitude"]),
    subSportType: getString(asRecord(summary.activityType) ?? {}, ["typeKey"]),
  };

  const hasStats = Object.values(stats).some((value) => value !== null);
  if (laps.length === 0 && zones.length === 0 && !hasStats) return null;

  return normalizedActivityDetailSchema.parse({
    provider: "GARMIN",
    externalId: activity.externalId,
    laps,
    zones,
    streams: [],
    stats,
    sources: {
      ...(laps.length > 0 ? { laps: { provider: "GARMIN", kind: "native" } } : {}),
      ...(zones.length > 0 ? { zones: { provider: "GARMIN", kind: "native" } } : {}),
      ...(hasStats ? { stats: { provider: "GARMIN", kind: "native" } } : {}),
    },
  });
}
