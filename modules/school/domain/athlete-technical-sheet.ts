/**
 * Technical sheet: the training parameters a coach needs in order to prescribe,
 * scoped to one athlete inside one school.
 *
 * Why a new entity instead of extending `UserProfile`: `UserProfile` is the
 * person's own account data (CPF, height, weight, layout preferences) and is
 * global. These are *coaching* parameters that belong to the school–athlete
 * relationship: two schools may legitimately hold different threshold paces for
 * the same athlete, and an athlete leaving a school must not carry that
 * school's assessment away with them. Scoping by `(schoolId, athleteId)` also
 * means the multi-tenant isolation the rest of this module enforces applies
 * here for free.
 *
 * Deliberately NOT stored here (documented rather than invented):
 * - no medical diagnosis field. `restrictions` is free text a professional
 *   wrote, and the screens present it as a note, never as a condition.
 * - no derived training-load metric (CTL/ATL/TSB and friends). The activity
 *   data available today has no per-second streams, so any such number would
 *   be a name without a methodology behind it.
 */
import { z } from "zod";
import { RYVANO_SPORT_TYPES } from "@/modules/shared/activities/sport-types";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((value) => (value && value.length > 0 ? value : null));

/**
 * Integer parameters. Bounds are wide on purpose — they reject typos and
 * nonsense (a threshold pace of 0, an FTP of 40 000 W) without pretending to
 * encode physiology.
 */
const optionalInt = (min: number, max: number) =>
  z.number().int().min(min).max(max).nullish().transform((value) => value ?? null);

export const ATHLETE_EXPERIENCE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "ELITE"] as const;
export type AthleteExperienceLevel = (typeof ATHLETE_EXPERIENCE_LEVELS)[number];

/**
 * Editable content of a technical sheet. Every field is optional: a sheet with
 * only a goal written in it is a legitimate sheet, and an athlete who has just
 * arrived has none at all.
 */
const sheetFieldsSchema = z.strictObject({
  /** Canonical `RyvanoSportType` values; the screen offers the school's own modalities first. */
  sportTypes: z.array(z.enum(RYVANO_SPORT_TYPES as unknown as [string, ...string[]]))
    .max(RYVANO_SPORT_TYPES.length)
    .default([])
    // Order carries no meaning, and a repeated modality is a UI accident.
    .transform((values) => [...new Set(values)]),
  experienceLevel: z.enum(ATHLETE_EXPERIENCE_LEVELS).nullish().transform((v) => v ?? null),
  goals: optionalText(2000),
  targetEvent: optionalText(300),
  targetEventDate: z.union([z.iso.date(), z.date()]).nullish()
    .transform((value) => (value ? new Date(value) : null)),
  availability: optionalText(1000),
  equipment: optionalText(1000),
  /** Declared limitations and safety notes written by the responsible professional. */
  restrictions: optionalText(2000),
  maxHeartRate: optionalInt(60, 260),
  thresholdHeartRate: optionalInt(60, 260),
  restingHeartRate: optionalInt(20, 150),
  /** Seconds per kilometre. */
  thresholdPaceSecPerKm: optionalInt(120, 1800),
  /** Functional threshold power, watts. */
  ftpWatts: optionalInt(30, 2000),
  /** Critical swim speed, seconds per 100 m. */
  cssSecPer100m: optionalInt(40, 600),
  notes: optionalText(2000),
});

type HeartRateFields = {
  maxHeartRate: number | null;
  thresholdHeartRate: number | null;
  restingHeartRate: number | null;
};

/** The only cross-field rule: the three heart rates have to be orderable. */
function checkHeartRateOrder(sheet: HeartRateFields, ctx: z.RefinementCtx) {
  const { maxHeartRate, thresholdHeartRate, restingHeartRate } = sheet;
  if (maxHeartRate !== null && thresholdHeartRate !== null && thresholdHeartRate > maxHeartRate) {
    ctx.addIssue({
      code: "custom",
      path: ["thresholdHeartRate"],
      message: "A FC de limiar não pode ser maior que a FC máxima.",
    });
  }
  if (maxHeartRate !== null && restingHeartRate !== null && restingHeartRate >= maxHeartRate) {
    ctx.addIssue({
      code: "custom",
      path: ["restingHeartRate"],
      message: "A FC de repouso não pode ser maior ou igual à FC máxima.",
    });
  }
}

export const athleteTechnicalSheetInputSchema = sheetFieldsSchema.superRefine(checkHeartRateOrder);

export type AthleteTechnicalSheetInput = z.infer<typeof athleteTechnicalSheetInputSchema>;

export const athleteTechnicalSheetSchema = sheetFieldsSchema.extend({
  id: opaqueId,
  schoolId: opaqueId,
  athleteId: opaqueId,
  updatedByUserId: opaqueId.nullable(),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((sheet, ctx) => {
  checkHeartRateOrder(sheet, ctx);
  if (sheet.updatedAt < sheet.createdAt) {
    ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  }
});

export type AthleteTechnicalSheet = z.infer<typeof athleteTechnicalSheetSchema>;

/**
 * Heart-rate zone boundaries as %FCmáx, matching
 * `modules/shared/activities/heart-rate-zones` so a zone named "Z3" means the
 * same thing on the technical sheet as on an activity detail screen.
 */
export const HEART_RATE_ZONE_BOUNDS = [
  { zone: 1, fromPercent: 50, toPercent: 60 },
  { zone: 2, fromPercent: 60, toPercent: 70 },
  { zone: 3, fromPercent: 70, toPercent: 80 },
  { zone: 4, fromPercent: 80, toPercent: 90 },
  { zone: 5, fromPercent: 90, toPercent: 100 },
] as const;

export type HeartRateZone = {
  zone: number;
  fromPercent: number;
  toPercent: number;
  fromBpm: number;
  toBpm: number;
};

/**
 * Derives the five zones from a reference maximum heart rate.
 *
 * Returns `[]` when there is no reference: a screen must then say "zones not
 * configured" rather than draw five empty bars, which reads as real data.
 */
export function deriveHeartRateZones(maxHeartRate: number | null): HeartRateZone[] {
  if (maxHeartRate === null || !Number.isFinite(maxHeartRate) || maxHeartRate <= 0) return [];
  return HEART_RATE_ZONE_BOUNDS.map((bound) => ({
    ...bound,
    fromBpm: Math.round((maxHeartRate * bound.fromPercent) / 100),
    toBpm: Math.round((maxHeartRate * bound.toPercent) / 100),
  }));
}
