import { WearableProvider } from "@prisma/client";
import type { Prisma } from "@prisma/client";

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nestedStringOrNull(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return stringOrNull((value as Record<string, unknown>).typeKey) ?? stringOrNull((value as Record<string, unknown>).displayName);
}

function dateOrNull(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function getExternalId(payload: Record<string, unknown>) {
  const candidates = [payload.activityId, payload.id, payload.externalId, payload.uuid];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null);

  if (!value) {
    throw new Error("GARMIN_ACTIVITY_ID_MISSING");
  }

  return String(value);
}

export function normalizeGarminActivity(payload: Record<string, unknown>) {
  const startedAt =
    dateOrNull(payload.startTimeLocal) ??
    dateOrNull(payload.startTimeGmt) ??
    dateOrNull(payload.startTime) ??
    new Date();

  const durationSeconds =
    numberOrNull(payload.durationSeconds) ??
    numberOrNull(payload.duration) ??
    numberOrNull(payload.elapsedDuration) ??
    null;

  const endedAt = durationSeconds ? new Date(startedAt.getTime() + durationSeconds * 1000) : null;

  return {
    externalId: getExternalId(payload),
    provider: WearableProvider.GARMIN,
    sportType:
      stringOrNull(payload.sportType) ??
      nestedStringOrNull(payload, "activityType") ??
      nestedStringOrNull(payload, "eventType") ??
      stringOrNull(payload.typeKey) ??
      "Atividade",
    name:
      stringOrNull(payload.activityName) ??
      stringOrNull(payload.name) ??
      stringOrNull(payload.summary) ??
      null,
    startedAt,
    endedAt,
    durationSeconds,
    movingSeconds: numberOrNull(payload.movingDuration) ?? numberOrNull(payload.movingDurationSeconds),
    distanceMeters: numberOrNull(payload.distance) ?? numberOrNull(payload.distanceMeters),
    calories: numberOrNull(payload.calories),
    averageHeartRate: numberOrNull(payload.averageHR) ?? numberOrNull(payload.averageHeartRate),
    maxHeartRate: numberOrNull(payload.maxHR) ?? numberOrNull(payload.maxHeartRate),
    averagePace: numberOrNull(payload.averagePace),
    averageSpeed: numberOrNull(payload.averageSpeed),
    maxSpeed: numberOrNull(payload.maxSpeed),
    elevationGain: numberOrNull(payload.elevationGain),
    averageCadence: numberOrNull(payload.averageCadence),
    averagePower: numberOrNull(payload.averagePower),
    maxPower: numberOrNull(payload.maxPower),
    timezone: stringOrNull(payload.timeZoneUnitDTO) ?? stringOrNull(payload.timezone),
    metrics: payload as Prisma.JsonObject,
    rawPayload: payload as Prisma.JsonObject,
  };
}
