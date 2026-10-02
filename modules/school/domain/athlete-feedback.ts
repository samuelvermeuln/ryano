/**
 * T223 — AthleteFeedback entity
 * T225 — Feedback validations (RPE, mood, energy ranges)
 */
import { z } from "zod";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

/** T225 — RPE 1–10, mood 1–5, energy 1–5 */
export const rpeSchema = z.number().int().min(1).max(10);
export const moodSchema = z.number().int().min(1).max(5);
export const energySchema = z.number().int().min(1).max(5);

/**
 * SAM-38 — feedback is anchored to exactly one of: a matched execution (the
 * prescription path, as before) or an imported activity with no prescription
 * behind it (`activityId`). Never both, never neither (CHECK in migration 0057).
 */
export const athleteFeedbackSchema = z.strictObject({
  id,
  workoutExecutionId:  id.nullable(),
  workoutAssignmentId: id.nullable(),
  activityId:          id.nullable(),
  athleteId:           id,
  rpe:                 rpeSchema,
  mood:                moodSchema.nullable(),
  energy:              energySchema.nullable(),
  comment:             z.string().max(2000).nullable(),
  createdAt:           z.date().transform((d) => new Date(d)),
  updatedAt:           z.date().transform((d) => new Date(d)),
}).superRefine((feedback, ctx) => {
  if ((feedback.workoutExecutionId !== null) === (feedback.activityId !== null)) {
    ctx.addIssue({ code: "custom", path: ["workoutExecutionId"], message: "Feedback pertence a uma execução OU a uma atividade." });
  }
  if (feedback.workoutExecutionId !== null && feedback.workoutAssignmentId === null) {
    ctx.addIssue({ code: "custom", path: ["workoutAssignmentId"], message: "Feedback de execução precisa da prescrição." });
  }
});

export type AthleteFeedback = z.infer<typeof athleteFeedbackSchema>;

export type CreateAthleteFeedbackInput = {
  id: string;
  athleteId: string;
  rpe: number;
  mood?: number | null;
  energy?: number | null;
  comment?: string | null;
} & (
  | { workoutExecutionId: string; workoutAssignmentId: string; activityId?: null }
  | { activityId: string; workoutExecutionId?: null; workoutAssignmentId?: null }
);

export function createAthleteFeedback(raw: CreateAthleteFeedbackInput, now: Date): AthleteFeedback {
  return athleteFeedbackSchema.parse({
    ...raw,
    workoutExecutionId:  raw.workoutExecutionId  ?? null,
    workoutAssignmentId: raw.workoutAssignmentId ?? null,
    activityId:          raw.activityId          ?? null,
    mood:    raw.mood    ?? null,
    energy:  raw.energy  ?? null,
    comment: raw.comment ?? null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });
}
