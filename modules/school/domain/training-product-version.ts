import { z } from "zod";
import { isRyvanoSportType } from "@/modules/shared/activities/sport-types";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);
const copiedDate = z.date().transform((v) => new Date(v));

// ── schemaVersion 1 (legacy): one workoutTemplateId per day ──────────────────
// Kept unchanged and under its original names (`planDaySchema`, `PlanDay`, …)
// so every existing caller and every already-published TrainingProductVersion
// keeps working without a data migration (RF-005, design D-03).

/** One entry in the weekly plan: which template goes on which day. */
export const planDaySchema = z.strictObject({
  workoutTemplateId: id,
  /** ISO weekday: 1 = Monday … 7 = Sunday */
  dayOfWeek: z.number().int().min(1).max(7),
  /** Notes for this specific day (warm-up reminders, etc.). */
  note: z.string().max(500).optional(),
});
export type PlanDay = z.infer<typeof planDaySchema>;

export const planWeekSchema = z.strictObject({
  week: z.number().int().min(1),
  days: z.array(planDaySchema).min(1).max(7),
});
export type PlanWeek = z.infer<typeof planWeekSchema>;

export const planPayloadSchema = z.strictObject({
  weeks: z.array(planWeekSchema).min(1).max(520),
});
export type PlanPayload = z.infer<typeof planPayloadSchema>;

// ── schemaVersion 2 (TM010, RF-005): sessions[] per day ──────────────────────
// A day can now carry more than one session (e.g. running + strength on the
// same day) and each session declares its own canonical sport, so a plan can
// mix modalities (RNF-006). A day with no sessions is simply absent from
// `days[]` — same "missing day = rest day" convention as v1.

/** One prescribed session within a day. `order` breaks ties when a day has more than one. */
export const planSessionSchema = z.strictObject({
  /** Stable id for auditability/reconciliation across adaptations (design D-06). */
  planSessionId: id,
  workoutTemplateId: id,
  sportType: z.string().refine(isRyvanoSportType, { message: "sportType must be a canonical RyvanoSportType" }),
  order: z.number().int().min(0),
  /** No-wearable-friendly alternative instructions for this session. */
  alternative: z.string().max(1000).optional(),
  note: z.string().max(500).optional(),
});
export type PlanSession = z.infer<typeof planSessionSchema>;

export const planDaySchemaV2 = z.strictObject({
  /** ISO weekday: 1 = Monday … 7 = Sunday */
  dayOfWeek: z.number().int().min(1).max(7),
  sessions: z.array(planSessionSchema).min(1).max(10),
  note: z.string().max(500).optional(),
});
export type PlanDayV2 = z.infer<typeof planDaySchemaV2>;

export const planWeekSchemaV2 = z.strictObject({
  week: z.number().int().min(1),
  days: z.array(planDaySchemaV2).min(1).max(7),
});
export type PlanWeekV2 = z.infer<typeof planWeekSchemaV2>;

export const planPayloadSchemaV2 = z.strictObject({
  weeks: z.array(planWeekSchemaV2).min(1).max(520),
});
export type PlanPayloadV2 = z.infer<typeof planPayloadSchemaV2>;

/**
 * TM021 — clones a week's `days[]`/`sessions[]` verbatim under a new week
 * number, for the editor's "duplicate week" action (RF-102).
 *
 * By design (see the TM010 test "duplicar semana preserva planSessionId
 * estável"), `planSessionId` identifies a recurring slot in the plan
 * template (e.g. "the Monday long run"), not a globally-unique row — so
 * duplicating a week intentionally KEEPS the same session ids under the new
 * `week` number rather than minting new ones; that stability is what lets a
 * later adjustment (design D-06, `PlanAdaptation`) or a re-save target the
 * "same" prescribed session across weeks. Deep-clones days/sessions so the
 * caller can't accidentally mutate the source week through the result.
 */
export function duplicatePlanWeek(week: PlanWeekV2, targetWeekNumber: number): PlanWeekV2 {
  return planWeekSchemaV2.parse({
    week: targetWeekNumber,
    days: week.days.map((day) => ({ ...day, sessions: day.sessions.map((session) => ({ ...session })) })),
  });
}

/**
 * Dispatches by `TrainingProductVersion.schemaVersion` (design D-03). Callers
 * that instantiate a calendar or render a plan should go through this instead
 * of importing `planPayloadSchema`/`planPayloadSchemaV2` directly, so a new
 * schemaVersion only needs to be taught here once.
 */
export function parsePlanPayload(schemaVersion: number, raw: unknown): PlanPayload | PlanPayloadV2 {
  return schemaVersion >= 2 ? planPayloadSchemaV2.parse(raw) : planPayloadSchema.parse(raw);
}

export const trainingProductVersionSchema = z.strictObject({
  id,
  productId: id,
  versionNumber: z.number().int().min(1),
  /** TM004 — dispatch key consumed by `parsePlanPayload`; defaults to 1 (legacy) to match the DB column default. */
  schemaVersion: z.number().int().min(1).default(1),
  planPayload: z.unknown(),
  changeNote: z.string().max(1000).nullable(),
  publishedAt: copiedDate.nullable(),
  createdAt: copiedDate,
}).superRefine((v, ctx) => {
  const schema = v.schemaVersion >= 2 ? planPayloadSchemaV2 : planPayloadSchema;
  const result = schema.safeParse(v.planPayload);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue, path: ["planPayload", ...issue.path] });
    }
  }
});

export type TrainingProductVersion = Omit<z.infer<typeof trainingProductVersionSchema>, "planPayload"> & {
  planPayload: PlanPayload | PlanPayloadV2;
};
// `planPayload` stays `unknown` on the way IN — it is only narrowed to
// `PlanPayload | PlanPayloadV2` on the way OUT, after `parsePlanPayload`
// validates it against `schemaVersion` in `superRefine` above. Callers
// should not need an already-narrowed literal type just to build the raw
// input object (e.g. a JSON payload deserialized from the editor UI).
export type CreateTrainingProductVersionInput = Omit<TrainingProductVersion, "createdAt" | "schemaVersion" | "planPayload"> & {
  schemaVersion?: number;
  planPayload: unknown;
};

export function createTrainingProductVersion(raw: CreateTrainingProductVersionInput, now: Date): TrainingProductVersion {
  return trainingProductVersionSchema.parse({ ...raw, createdAt: now }) as TrainingProductVersion;
}
