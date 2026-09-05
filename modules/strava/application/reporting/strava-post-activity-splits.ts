import { formatPace, formatSpeed, formatSwimPace } from "@/lib/format";
import type { PostActivitySplit } from "@/lib/reports/types";

type StravaPostActivitySplitData = {
  splitLabel: string;
  splitUnit: string;
  splits: PostActivitySplit[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function resolveSport(sportType: string): "swim" | "bike" | "run" {
  const sport = sportType.toLowerCase();
  if (sport.includes("swim") || sport.includes("nat") || sport.includes("open-water")) return "swim";
  if (sport.includes("cycl") || sport.includes("bike") || sport.includes("mtb")) return "bike";
  return "run";
}

/** Maps persisted, normalized Strava laps without making a provider request. */
export function buildPersistedStravaPostActivitySplits(
  metrics: unknown,
  sportType: string,
): StravaPostActivitySplitData {
  const laps = asRecord(asRecord(metrics)?.stravaActivityDetails)?.laps;
  const sport = resolveSport(sportType);
  const splits = Array.isArray(laps)
    ? laps.flatMap((lap, position) => {
      const row = asRecord(lap);
      if (!row) return [];

      const seconds = row.durationSeconds;
      const distance = row.distanceMeters;
      if (typeof seconds !== "number" || seconds <= 0 || typeof distance !== "number" || distance <= 0) return [];

      const formatted = sport === "swim"
        ? formatSwimPace((seconds / distance) * 100)
        : sport === "bike"
          ? formatSpeed((distance / seconds) * 3.6)
          : formatPace((seconds / distance) * 1_000);
      if (formatted === "—") return [];

      const index = typeof row.index === "number" && row.index > 0 ? row.index : position + 1;
      return [{
        label: sport === "swim" ? `Volta ${index}` : sport === "run" ? `Km ${index}` : `Split ${index}`,
        value: formatted.split(/\s+/)[0] ?? formatted,
        seconds: Math.round(seconds),
      } satisfies PostActivitySplit];
    }).slice(0, 8)
    : [];

  const label = sport === "swim" ? "Parciais (voltas · Strava)" : sport === "run" ? "Parciais (km · Strava)" : "Parciais · Strava";
  return {
    splitLabel: label,
    splitUnit: sport === "swim" ? "/100 m" : sport === "run" ? "/km" : "km/h",
    splits,
  };
}
