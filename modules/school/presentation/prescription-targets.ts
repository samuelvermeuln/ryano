/**
 * SAM-18 — what a block can be targeted by, per modality, and the zone options
 * the builder offers from the athlete's sheet.
 *
 * Decided by the metric display category of the canonical sport
 * (`getMetricDisplayCategory`), never by the sport name: a category says
 * whether the modality is read by pace per km, pace per 100 m, or power.
 * Heart rate and RPE apply to every modality. No directive: used by the
 * Server Component that builds the options and by the client builder.
 */
import { formatPace, formatSwimPace } from "@/lib/format";
import {
  getMetricDisplayCategory,
  METRIC_DISPLAY_RULES,
  type MetricDisplayCategory,
} from "@/modules/shared/activities/metric-display-categories";
import type { RyvanoSportType } from "@/modules/shared/activities/sport-types";
import {
  HEART_RATE_ZONE_METHOD_LABELS,
  type HeartRateZoneTable,
  type PaceZone,
  type PowerZone,
  type TrainingZones,
} from "../domain/training-zones";

/** Intensity dimensions a block target may carry, beyond heart rate and RPE. */
export type TargetKind = "pace" | "swimPace" | "power";

/**
 * Pace per km when the category reads pace per km; pace per 100 m when it
 * reads per 100 m; power when the category has no pace and falls back to
 * speed (cycling and the other wheel/paddle categories). Everything else
 * (strength, team sports…) is heart rate and RPE only.
 */
export function targetKindForCategory(category: MetricDisplayCategory): TargetKind | null {
  const rules = METRIC_DISPLAY_RULES[category];
  if (rules.pace === "pace-per-km") return "pace";
  if (rules.pace === "pace-per-100m") return "swimPace";
  if (rules.speedFallback) return "power";
  return null;
}

export function targetKindForSport(sportType: RyvanoSportType): TargetKind | null {
  return targetKindForCategory(getMetricDisplayCategory(sportType));
}

export type ZoneOption = {
  zone: number;
  label: string;
  /** Heart-rate bounds, when the option comes from the heart-rate table. */
  heartRateMin?: number;
  heartRateMax?: number;
  /** Pace value (seconds per unit) the option fills in: the band's midpoint, or its edge for open bands. */
  paceSeconds?: number;
  /** Watts the option fills in: the band's midpoint, or its edge for the open band. */
  power?: number;
};

export type BuilderZoneOptions = {
  heartRate: { method: string; options: ZoneOption[] } | null;
  pace: ZoneOption[] | null;
  swimPace: ZoneOption[] | null;
  power: ZoneOption[] | null;
};

function heartRateOptions(table: HeartRateZoneTable): BuilderZoneOptions["heartRate"] {
  return {
    method: HEART_RATE_ZONE_METHOD_LABELS[table.method],
    options: table.zones.map((zone) => ({
      zone: zone.zone,
      label: `Z${zone.zone} (${zone.fromBpm}–${zone.toBpm} bpm)`,
      heartRateMin: zone.fromBpm,
      heartRateMax: zone.toBpm,
    })),
  };
}

function paceOptions(zones: PaceZone[], format: (seconds: number) => string): ZoneOption[] {
  return zones.map((zone) => {
    const fast = zone.fromSec;
    const slow = zone.toSec;
    // An open slow side (Z1) has only its fastest bound; an open fast side (Z5) only its slowest.
    const label = fast !== null && slow !== null
      ? `Z${zone.zone} (${format(fast)} – ${format(slow)})`
      : fast !== null
        ? `Z${zone.zone} (mais lento que ${format(fast)})`
        : `Z${zone.zone} (mais rápido que ${format(slow!)})`;
    const paceSeconds = fast !== null && slow !== null ? Math.round((fast + slow) / 2) : fast ?? slow!;
    return { zone: zone.zone, label, paceSeconds };
  });
}

function powerOptions(zones: PowerZone[]): ZoneOption[] {
  return zones.map((zone) => ({
    zone: zone.zone,
    label: zone.toWatts !== null
      ? `Z${zone.zone} (${zone.fromWatts}–${zone.toWatts} W)`
      : `Z${zone.zone} (acima de ${zone.fromWatts} W)`,
    power: zone.toWatts !== null ? Math.round((zone.fromWatts + zone.toWatts) / 2) : zone.fromWatts,
  }));
}

/** Zone options for the builder, one list per family the sheet supports. */
export function buildZoneOptions(zones: TrainingZones): BuilderZoneOptions {
  return {
    heartRate: zones.heartRate ? heartRateOptions(zones.heartRate) : null,
    pace: zones.pace ? paceOptions(zones.pace, formatPace) : null,
    swimPace: zones.swim ? paceOptions(zones.swim, formatSwimPace) : null,
    power: zones.power ? powerOptions(zones.power) : null,
  };
}

/** Labels for the parameter history, shared by the sheet screen and tests. */
export const TRACKED_PARAMETER_LABELS: Record<string, string> = {
  maxHeartRate: "FC máxima",
  thresholdHeartRate: "FC de limiar",
  restingHeartRate: "FC de repouso",
  thresholdPaceSecPerKm: "Ritmo de limiar",
  ftpWatts: "FTP",
  cssSecPer100m: "CSS",
  heartRateZoneMethod: "Método das zonas de FC",
};

/** One revision value as the coach reads it, by field. */
export function formatTrackedValue(field: string, value: number | string | null): string {
  if (value === null) return "—";
  switch (field) {
    case "maxHeartRate":
    case "thresholdHeartRate":
    case "restingHeartRate":
      return `${value} bpm`;
    case "thresholdPaceSecPerKm":
      return formatPace(Number(value));
    case "cssSecPer100m":
      return formatSwimPace(Number(value));
    case "ftpWatts":
      return `${value} W`;
    case "heartRateZoneMethod":
      return HEART_RATE_ZONE_METHOD_LABELS[value as keyof typeof HEART_RATE_ZONE_METHOD_LABELS] ?? String(value);
    default:
      return String(value);
  }
}
