/**
 * SAM-18 — training zones derived from the technical sheet's parameters.
 *
 * Pure: tables in, tables out, nothing stored. Each family is derived only
 * when its reference parameter exists, so a screen can say "not configured"
 * instead of drawing five empty bars. Zone numbers are 1–5 in every family so
 * "Z3" on a block target means the same level of effort whichever reference
 * the coach prescribed by.
 *
 * Sources (paraphrased, not copied):
 * - Heart rate, %FCmáx: the five 50/60/70/80/90–100% bands already used by
 *   `modules/shared/activities/heart-rate-zones` for activity detail.
 * - Heart rate, %HRR (Karvonen): bpm = resting + % × (max − resting), same five
 *   bands; needs both max and resting heart rate.
 * - Heart rate, %LTHR: Garmin Connect's lactate-threshold method — Z1 up to
 *   85%, Z2 85–89%, Z3 89–95%, Z4 95–100%, Z5 above the threshold (capped at
 *   FCmáx when known, else 110%). Needs the threshold heart rate.
 * - Running pace: bands as % of threshold speed, a 5-zone reading of the
 *   Intervals.icu-style defaults — Z1 below 80%, Z2 80–88%, Z3 88–95%,
 *   Z4 95–104%, Z5 above 104% of threshold speed (pace = threshold pace ÷ %).
 * - Power: Coggan's levels as % of FTP — Z1 below 55%, Z2 55–75%, Z3 75–90%,
 *   Z4 90–105%, Z5 above 105% (Coggan's L6/L7 fold into the open top band).
 * - Swimming: same speed bands as running pace, applied to the CSS (seconds
 *   per 100 m).
 */

export const HEART_RATE_ZONE_METHODS = ["MAX_HR", "HRR", "LTHR"] as const;
export type HeartRateZoneMethod = (typeof HEART_RATE_ZONE_METHODS)[number];

export const HEART_RATE_ZONE_METHOD_LABELS: Record<HeartRateZoneMethod, string> = {
  MAX_HR: "% FC máxima",
  HRR: "% reserva (Karvonen)",
  LTHR: "% FC de limiar",
};

export type ZoneParameters = {
  maxHeartRate: number | null;
  thresholdHeartRate: number | null;
  restingHeartRate: number | null;
  thresholdPaceSecPerKm: number | null;
  ftpWatts: number | null;
  cssSecPer100m: number | null;
  /** Method chosen on the sheet; null means "whatever the parameters allow", preferring %FCmáx. */
  heartRateZoneMethod: HeartRateZoneMethod | null;
};

export type HeartRateZone = {
  zone: number;
  fromPercent: number;
  /** null for an open top band (LTHR Z5 without a known maximum). */
  toPercent: number | null;
  fromBpm: number;
  toBpm: number;
};

export type HeartRateZoneTable = {
  method: HeartRateZoneMethod;
  zones: HeartRateZone[];
};

/** Pace families: lower seconds = faster; `fromSec` is the faster bound. */
export type PaceZone = {
  zone: number;
  /** % of threshold speed, lower bound. */
  fromPercent: number;
  toPercent: number | null;
  /** Fastest pace in the band (seconds per unit); null for an open top band. */
  fromSec: number | null;
  /** Slowest pace in the band (seconds per unit); null for the open bottom band. */
  toSec: number | null;
};

export type PowerZone = {
  zone: number;
  fromPercent: number;
  toPercent: number | null;
  fromWatts: number;
  toWatts: number | null;
};

export type TrainingZones = {
  heartRate: HeartRateZoneTable | null;
  /** Seconds per km. */
  pace: PaceZone[] | null;
  power: PowerZone[] | null;
  /** Seconds per 100 m. */
  swim: PaceZone[] | null;
};

const PERCENT_OF_MAX_BANDS = [
  { zone: 1, fromPercent: 50, toPercent: 60 },
  { zone: 2, fromPercent: 60, toPercent: 70 },
  { zone: 3, fromPercent: 70, toPercent: 80 },
  { zone: 4, fromPercent: 80, toPercent: 90 },
  { zone: 5, fromPercent: 90, toPercent: 100 },
] as const;

const PERCENT_OF_LTHR_BANDS = [
  { zone: 1, fromPercent: 65, toPercent: 85 },
  { zone: 2, fromPercent: 85, toPercent: 89 },
  { zone: 3, fromPercent: 89, toPercent: 95 },
  { zone: 4, fromPercent: 95, toPercent: 100 },
  { zone: 5, fromPercent: 100, toPercent: null },
] as const;

/** Open top band of %LTHR when the maximum is unknown. */
const LTHR_OPEN_TOP_PERCENT = 110;

const SPEED_BANDS = [
  { zone: 1, fromPercent: 0, toPercent: 80 },
  { zone: 2, fromPercent: 80, toPercent: 88 },
  { zone: 3, fromPercent: 88, toPercent: 95 },
  { zone: 4, fromPercent: 95, toPercent: 104 },
  { zone: 5, fromPercent: 104, toPercent: null },
] as const;

const POWER_BANDS = [
  { zone: 1, fromPercent: 0, toPercent: 55 },
  { zone: 2, fromPercent: 55, toPercent: 75 },
  { zone: 3, fromPercent: 75, toPercent: 90 },
  { zone: 4, fromPercent: 90, toPercent: 105 },
  { zone: 5, fromPercent: 105, toPercent: null },
] as const;

function positive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

/** Which heart-rate methods the parameters support, in preference order. */
export function availableHeartRateMethods(params: ZoneParameters): HeartRateZoneMethod[] {
  const methods: HeartRateZoneMethod[] = [];
  if (positive(params.maxHeartRate)) methods.push("MAX_HR");
  if (positive(params.maxHeartRate) && positive(params.restingHeartRate) && params.restingHeartRate < params.maxHeartRate) {
    methods.push("HRR");
  }
  if (positive(params.thresholdHeartRate)
    && (params.maxHeartRate === null || params.thresholdHeartRate <= params.maxHeartRate)) {
    methods.push("LTHR");
  }
  return methods;
}

/**
 * The heart-rate table for the chosen method, or for the first method the
 * parameters allow when none was chosen (or the chosen one is impossible —
 * a sheet that asked for %HRR before the resting heart rate was recorded
 * still gets %FCmáx rather than nothing).
 */
export function deriveHeartRateZoneTable(params: ZoneParameters): HeartRateZoneTable | null {
  const available = availableHeartRateMethods(params);
  const method = params.heartRateZoneMethod && available.includes(params.heartRateZoneMethod)
    ? params.heartRateZoneMethod
    : available[0];
  if (!method) return null;

  if (method === "MAX_HR") {
    const max = params.maxHeartRate!;
    return {
      method,
      zones: PERCENT_OF_MAX_BANDS.map((band) => ({
        ...band,
        fromBpm: Math.round((max * band.fromPercent) / 100),
        toBpm: Math.round((max * band.toPercent) / 100),
      })),
    };
  }

  if (method === "HRR") {
    const max = params.maxHeartRate!;
    const rest = params.restingHeartRate!;
    const reserve = max - rest;
    return {
      method,
      zones: PERCENT_OF_MAX_BANDS.map((band) => ({
        ...band,
        fromBpm: Math.round(rest + (reserve * band.fromPercent) / 100),
        toBpm: Math.round(rest + (reserve * band.toPercent) / 100),
      })),
    };
  }

  const threshold = params.thresholdHeartRate!;
  const cap = positive(params.maxHeartRate) ? params.maxHeartRate : Math.round((threshold * LTHR_OPEN_TOP_PERCENT) / 100);
  return {
    method,
    zones: PERCENT_OF_LTHR_BANDS.map((band) => ({
      ...band,
      fromBpm: Math.round((threshold * band.fromPercent) / 100),
      toBpm: band.toPercent === null ? cap : Math.round((threshold * band.toPercent) / 100),
    })),
  };
}

/** Pace bands from a threshold pace (seconds per unit), as % of threshold speed. */
function deriveSpeedBands(thresholdSeconds: number | null): PaceZone[] | null {
  if (!positive(thresholdSeconds)) return null;
  return SPEED_BANDS.map((band) => ({
    ...band,
    // Faster speed = fewer seconds, so the upper % bound is the faster pace.
    fromSec: band.toPercent === null ? null : Math.round((thresholdSeconds * 100) / band.toPercent),
    toSec: band.fromPercent === 0 ? null : Math.round((thresholdSeconds * 100) / band.fromPercent),
  }));
}

export function derivePaceZones(thresholdPaceSecPerKm: number | null): PaceZone[] | null {
  return deriveSpeedBands(thresholdPaceSecPerKm);
}

export function deriveSwimZones(cssSecPer100m: number | null): PaceZone[] | null {
  return deriveSpeedBands(cssSecPer100m);
}

export function derivePowerZones(ftpWatts: number | null): PowerZone[] | null {
  if (!positive(ftpWatts)) return null;
  return POWER_BANDS.map((band) => ({
    ...band,
    fromWatts: Math.round((ftpWatts * band.fromPercent) / 100),
    toWatts: band.toPercent === null ? null : Math.round((ftpWatts * band.toPercent) / 100),
  }));
}

export function deriveTrainingZones(params: ZoneParameters): TrainingZones {
  return {
    heartRate: deriveHeartRateZoneTable(params),
    pace: derivePaceZones(params.thresholdPaceSecPerKm),
    power: derivePowerZones(params.ftpWatts),
    swim: deriveSwimZones(params.cssSecPer100m),
  };
}
