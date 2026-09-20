import { z } from "zod";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);
const copiedDate = z.date().transform((v) => new Date(v));

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

export const trainingProductVersionSchema = z.strictObject({
  id,
  productId: id,
  versionNumber: z.number().int().min(1),
  planPayload: planPayloadSchema,
  changeNote: z.string().max(1000).nullable(),
  publishedAt: copiedDate.nullable(),
  createdAt: copiedDate,
});

export type TrainingProductVersion = z.infer<typeof trainingProductVersionSchema>;
export type CreateTrainingProductVersionInput = Omit<TrainingProductVersion, "createdAt">;

export function createTrainingProductVersion(raw: CreateTrainingProductVersionInput, now: Date): TrainingProductVersion {
  return trainingProductVersionSchema.parse({ ...raw, createdAt: now });
}
