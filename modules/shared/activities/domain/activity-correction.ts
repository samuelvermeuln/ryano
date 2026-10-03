/**
 * SAM-73 — activity data quality (§14.6, §15.6, §18.3).
 *
 * - A correction is append-only: the provider's original is never
 *   overwritten; the activity shows the corrected value with a "corrigido"
 *   badge and the original stays readable, with the reason and the author.
 * - Pool length is corrected explicitly (25 m ↔ 25 yd ↔ 50 m): the distance
 *   is recomputed from the length count and shown with its method — never a
 *   silent conversion.
 * - GPS inconsistency is only FLAGGED (impossible speed for the modality, a
 *   jump between samples); nothing is corrected on its own.
 * - Every estimated value carries its method in the label.
 */
import { z } from "zod";

export const CORRECTABLE_FIELDS = ["distanceMeters", "movingSeconds", "poolLengthMeters"] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

export const CORRECTION_FIELD_LABELS: Record<CorrectableField, string> = {
  distanceMeters: "Distância",
  movingSeconds: "Tempo em movimento",
  poolLengthMeters: "Comprimento da piscina",
};

/** Pool lengths offered; "yd" is stored in metres with the unit kept for the label. */
export const POOL_LENGTHS = [
  { value: 25, unit: "m", label: "25 m" },
  { value: 22.86, unit: "yd", label: "25 jd" },
  { value: 33.33, unit: "m", label: "33,3 m" },
  { value: 50, unit: "m", label: "50 m" },
] as const;

export const correctionInputSchema = z.strictObject({
  field: z.enum(CORRECTABLE_FIELDS),
  correctedValue: z.number().positive().max(10_000_000),
  reason: z.string().trim().min(3, "Diga por que o valor está sendo corrigido.").max(1000),
});
export type CorrectionInput = z.infer<typeof correctionInputSchema>;

export type CorrectionRow = {
  field: CorrectableField;
  originalValue: number | null;
  correctedValue: number;
  reason: string;
  authorName: string | null;
  authorRole: "athlete" | "coach";
  createdAt: Date;
};

/** The value in force for a field: the latest correction, else the provider's. */
export function effectiveValue(field: CorrectableField, original: number | null, corrections: CorrectionRow[]) {
  const latest = corrections.filter((row) => row.field === field).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return latest ? { value: latest.correctedValue, corrected: true as const, correction: latest } : { value: original, corrected: false as const, correction: null };
}

/**
 * Pool correction: the number of lengths is what the watch counted; the
 * distance is lengths × the right pool length, stated as the method.
 */
export function recomputePoolDistance(originalDistanceMeters: number, originalPoolLength: number, newPoolLength: number) {
  const lengths = Math.round(originalDistanceMeters / originalPoolLength);
  const distance = Math.round(lengths * newPoolLength * 100) / 100;
  return { lengths, distanceMeters: distance, method: `${lengths} piscinas × ${newPoolLength} m` };
}

/** "5:05 /km" → "mais rápido" / "mais lento" against a reference, no ambiguous sign (§14.6). */
export function paceComparisonLabel(paceSeconds: number, referenceSeconds: number) {
  if (paceSeconds === referenceSeconds) return "no mesmo ritmo";
  const delta = Math.abs(paceSeconds - referenceSeconds);
  const text = `${Math.floor(delta / 60)}:${String(delta % 60).padStart(2, "0")}`;
  return paceSeconds < referenceSeconds ? `mais rápido em ${text}` : `mais lento em ${text}`;
}

/** Plausible top speeds (m/s) per modality, used only to FLAG; above them the GPS distance may be wrong. */
const MAX_PLAUSIBLE_SPEED: Record<string, number> = {
  run: 8, "trail-run": 8, walk: 4, hike: 4, swim: 3, "open-water": 3, ride: 25, "gravel-ride": 25, "mountain-bike": 20, "e-bike": 25, rowing: 8, default: 30,
};

export type GpsFinding = { kind: "IMPOSSIBLE_SPEED" | "JUMP"; atSecond: number; detail: string };

/**
 * Flags, never fixes: samples faster than the modality allows, or a jump
 * between consecutive positions far beyond the elapsed time.
 */
export function detectGpsInconsistencies(input: {
  sportType: string;
  time: number[];
  distance?: Array<number | null>;
  latlng?: Array<[number, number] | null>;
}): GpsFinding[] {
  const limit = MAX_PLAUSIBLE_SPEED[input.sportType] ?? MAX_PLAUSIBLE_SPEED.default!;
  const findings: GpsFinding[] = [];
  const { time } = input;
  for (let index = 1; index < time.length && findings.length < 5; index += 1) {
    const dt = time[index]! - time[index - 1]!;
    if (dt <= 0) continue;
    const d0 = input.distance?.[index - 1];
    const d1 = input.distance?.[index];
    if (typeof d0 === "number" && typeof d1 === "number") {
      const speed = (d1 - d0) / dt;
      if (speed > limit * 1.5) {
        findings.push({ kind: "IMPOSSIBLE_SPEED", atSecond: time[index]!, detail: `${(speed * 3.6).toFixed(0)} km/h em ${dt} s` });
        continue;
      }
    }
    const p0 = input.latlng?.[index - 1];
    const p1 = input.latlng?.[index];
    if (p0 && p1) {
      const metres = haversine(p0, p1);
      if (metres / dt > limit * 1.5) findings.push({ kind: "JUMP", atSecond: time[index]!, detail: `salto de ${metres.toFixed(0)} m em ${dt} s` });
    }
  }
  return findings;
}

function haversine([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** §14.6 — the three times, each labelled; absent is "não medido", never zero. */
export function timeBreakdown(input: { elapsedSeconds: number | null; timerSeconds: number | null; movingSeconds: number | null; durationSeconds: number | null }) {
  const elapsed = input.elapsedSeconds ?? null;
  const moving = input.movingSeconds ?? null;
  const timer = input.timerSeconds ?? input.durationSeconds ?? null;
  const pauses = elapsed !== null && moving !== null ? Math.max(0, elapsed - moving) : null;
  return { elapsed, moving, timer, pauses };
}
