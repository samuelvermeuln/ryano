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
import { deriveHeartRateZoneTable, HEART_RATE_ZONE_METHODS, type HeartRateZone } from "./training-zones";

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
  /** SAM-18 — how heart-rate zones are derived; null = first method the parameters allow. */
  heartRateZoneMethod: z.enum(HEART_RATE_ZONE_METHODS).nullish().transform((v) => v ?? null),
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
  /** The school the sheet belongs to, or null for independent coaching (SAM-30). */
  schoolId: opaqueId.nullable(),
  /** The coach the sheet belongs to when there is no school; null inside a school. */
  coachId: opaqueId.nullable(),
  athleteId: opaqueId,
  updatedByUserId: opaqueId.nullable(),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((sheet, ctx) => {
  checkHeartRateOrder(sheet, ctx);
  if (sheet.updatedAt < sheet.createdAt) {
    ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  }
  // A sheet is always the parameters of ONE coaching relationship.
  if (sheet.schoolId === null && sheet.coachId === null) {
    ctx.addIssue({ code: "custom", path: ["schoolId"], message: "A sheet belongs to a school or to an independent coach" });
  }
});

export type AthleteTechnicalSheet = z.infer<typeof athleteTechnicalSheetSchema>;

export type { HeartRateZone } from "./training-zones";

/**
 * SAM-18 — the parameters whose history matters to interpret an old
 * prescription: thresholds and the zone method. Free text (goals, notes…) is
 * audited by field name only, as before.
 */
export const TRACKED_PARAMETER_FIELDS = [
  "maxHeartRate", "thresholdHeartRate", "restingHeartRate",
  "thresholdPaceSecPerKm", "ftpWatts", "cssSecPer100m", "heartRateZoneMethod",
] as const;
export type TrackedParameterField = (typeof TRACKED_PARAMETER_FIELDS)[number];

export type ParameterChange = { from: number | string | null; to: number | string | null };
export type ParameterChanges = Partial<Record<TrackedParameterField, ParameterChange>>;

type TrackedValues = Partial<Record<TrackedParameterField, number | string | null | undefined>>;

/** Field → { from, to } for every tracked parameter that differs; empty when nothing changed. */
export function diffTrackedParameters(previous: TrackedValues | null, next: TrackedValues): ParameterChanges {
  const changes: ParameterChanges = {};
  for (const field of TRACKED_PARAMETER_FIELDS) {
    const from = previous?.[field] ?? null;
    const to = next[field] ?? null;
    if (from !== to) changes[field] = { from, to };
  }
  return changes;
}

/**
 * The five %FCmáx zones from a reference maximum heart rate — the default
 * method; `deriveTrainingZones` (training-zones.ts) is the full picture.
 *
 * Returns `[]` when there is no reference: a screen must then say "zones not
 * configured" rather than draw five empty bars, which reads as real data.
 */
export function deriveHeartRateZones(maxHeartRate: number | null): HeartRateZone[] {
  return deriveHeartRateZoneTable({
    maxHeartRate, thresholdHeartRate: null, restingHeartRate: null,
    thresholdPaceSecPerKm: null, ftpWatts: null, cssSecPer100m: null, heartRateZoneMethod: "MAX_HR",
  })?.zones ?? [];
}
