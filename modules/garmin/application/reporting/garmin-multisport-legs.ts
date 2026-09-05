import { formatDistance, formatDurationClock, formatPace, formatSpeed, formatSwimPace } from "@/lib/format";
import type { PostActivityLegActivity, PostActivitySplit } from "@/lib/reports/types";

type GarminLegSport = PostActivityLegActivity["sport"];

type GarminTypedSplit = {
  sport: GarminLegSport;
  distanceMeters: number;
  durationSeconds: number;
};

const SPORT_ORDER: readonly GarminLegSport[] = ["natacao", "ciclismo", "corrida"];

type GarminPostActivitySplitData = {
  splitLabel: string;
  splitUnit: string;
  splits: PostActivitySplit[];
};

/** Maps Garmin lap/split rows into the compact single-sport report contract. */
export function buildGarminPostActivitySplits(
  payload: unknown,
  sportType: string,
): GarminPostActivitySplitData {
  const sport = resolvePostActivitySplitSport(sportType);
  const splits = toRecordArray(payload)
    .map((row, index) => buildPostActivitySplit(row, index, sport))
    .filter((split): split is PostActivitySplit => split !== null)
    .slice(0, 8);

  return {
    splitLabel: sport === "swim" ? "Parciais (voltas)" : sport === "run" ? "Parciais (km)" : "Parciais",
    splitUnit: sport === "swim" ? "/100 m" : sport === "run" ? "/km" : "km/h",
    splits,
  };
}

/** Reads the split payload cached with the normalized activity, without network I/O. */
export function buildPersistedGarminPostActivitySplits(
  metrics: unknown,
  sportType: string,
): GarminPostActivitySplitData {
  const root = toRecord(metrics);
  const details = toRecord(root?.garminActivityDetails) ?? root;
  const sources = [
    details?.typedSplits,
    details?.splits,
    details?.splitSummaries,
  ];

  for (const source of sources) {
    const splitData = buildGarminPostActivitySplits(source, sportType);
    if (splitData.splits.length) {
      return splitData;
    }
  }

  return buildGarminPostActivitySplits([], sportType);
}

function buildPostActivitySplit(
  row: Record<string, unknown>,
  index: number,
  sport: "swim" | "bike" | "run",
): PostActivitySplit | null {
  const seconds = getNumber(row, ["elapsedDuration", "duration", "durationSeconds", "movingDuration", "totalTimeInSeconds", "timeInSeconds"]);
  const distanceMeters = getNumber(row, ["distance", "distanceMeters", "distanceInMeters", "totalDistanceInMeters", "lengthDistance"]);

  if (seconds === null || seconds <= 0) {
    return null;
  }

  const averagePace = getNumber(row, ["averagePace", "pace"]);
  const averageSpeed = getNumber(row, ["averageSpeed", "avgSpeed"]);
  const formattedValue = sport === "swim"
    ? formatSwimPace(averagePace ?? (distanceMeters && distanceMeters > 0 ? (seconds / distanceMeters) * 100 : null))
    : sport === "bike"
      ? formatSpeed(averageSpeed === null ? (distanceMeters && distanceMeters > 0 ? (distanceMeters / seconds) * 3.6 : null) : averageSpeed * 3.6)
      : formatPace(averagePace ?? (distanceMeters && distanceMeters > 0 ? (seconds / distanceMeters) * 1_000 : null));

  if (formattedValue === "—") {
    return null;
  }

  const value = formattedValue.split(/\s+/)[0] ?? formattedValue;

  return {
    label: buildPostActivitySplitLabel(row, index, sport),
    value,
    seconds: Math.round(seconds),
  };
}

function resolvePostActivitySplitSport(sportType: string): "swim" | "bike" | "run" {
  const normalized = sportType.toLowerCase();
  if (normalized.includes("swim") || normalized.includes("nat") || normalized.includes("open-water")) return "swim";
  if (normalized.includes("cycl") || normalized.includes("bike") || normalized.includes("mtb")) return "bike";
  return "run";
}

function buildPostActivitySplitLabel(
  row: Record<string, unknown>,
  index: number,
  sport: "swim" | "bike" | "run",
) {
  const lapIndex = getNumber(row, ["lapIndex"]);
  const number = lapIndex === null
    ? getNumber(row, ["lapNumber", "splitNumber", "startIndex"]) ?? index + 1
    : lapIndex + 1;

  if (sport === "swim") return `Volta ${Math.round(number)}`;
  if (sport === "run") return `Km ${Math.round(number)}`;
  return `Split ${Math.round(number)}`;
}

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
