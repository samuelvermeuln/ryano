import { formatDistance, formatDurationClock, formatPace, formatSpeed, formatSwimPace } from "@/lib/format";
import type { PostActivityLegActivity } from "@/lib/reports/types";

type GarminLegSport = PostActivityLegActivity["sport"];

type GarminTypedSplit = {
  sport: GarminLegSport;
  distanceMeters: number;
  durationSeconds: number;
};

const SPORT_ORDER: readonly GarminLegSport[] = ["natacao", "ciclismo", "corrida"];

export function buildGarminMultisportLegs(payload: unknown): PostActivityLegActivity[] {
  const totals = new Map<GarminLegSport, { distanceMeters: number; durationSeconds: number }>();

  for (const item of toRecordArray(payload)) {
    const split = parseTypedSplit(item);
    if (!split) continue;

    const current = totals.get(split.sport) ?? { distanceMeters: 0, durationSeconds: 0 };
    current.distanceMeters += split.distanceMeters;
    current.durationSeconds += split.durationSeconds;
    totals.set(split.sport, current);
  }

  return SPORT_ORDER.flatMap((sport) => {
    const total = totals.get(sport);
    if (!total) return [];

    return [{
      type: "activity" as const,
      sport,
      distance: formatDistance(total.distanceMeters),
      time: formatDurationClock(total.durationSeconds),
      pace: formatLegPace(sport, total),
    }];
  });
}

function parseTypedSplit(value: Record<string, unknown>): GarminTypedSplit | null {
  const sport = resolveSport(value);
  const distanceMeters = getNumber(value, ["distance", "distanceMeters", "distanceInMeters", "totalDistanceInMeters", "lengthDistance"]);
  const durationSeconds = getNumber(value, ["elapsedDuration", "duration", "durationSeconds", "movingDuration", "totalTimeInSeconds", "timeInSeconds"]);

  if (!sport || distanceMeters === null || distanceMeters <= 0 || durationSeconds === null || durationSeconds <= 0) {
    return null;
  }

  return { sport, distanceMeters, durationSeconds };
}

function resolveSport(value: Record<string, unknown>): GarminLegSport | null {
  const activityType = toRecord(value.activityType);
  const raw = [
    value.sportType,
    value.typeKey,
    value.splitType,
    activityType?.typeKey,
    activityType?.displayName,
  ].find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);

  if (!raw) return null;

  const normalized = raw.toLowerCase();
  if (normalized.includes("swim") || normalized.includes("nat")) return "natacao";
  if (normalized.includes("cycl") || normalized.includes("bike")) return "ciclismo";
  if (normalized.includes("run") || normalized.includes("corr")) return "corrida";
  return null;
}

function formatLegPace(sport: GarminLegSport, total: { distanceMeters: number; durationSeconds: number }) {
  if (sport === "natacao") {
    return formatSwimPace((total.durationSeconds / total.distanceMeters) * 100);
  }

  if (sport === "ciclismo") {
    return formatSpeed((total.distanceMeters / total.durationSeconds) * 3.6);
  }

  return formatPace((total.durationSeconds / total.distanceMeters) * 1000);
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  }

  const record = toRecord(value);
  if (!record) return [];

  return Object.values(record).find(Array.isArray)?.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  ) ?? [];
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getNumber(value: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }

  return null;
}
