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
 * SAM-38 — feedback is anchored to a prescription (`workoutAssignmentId`,
 * with or without a matched execution) or to an imported activity with no
 * prescription behind it (`activityId`). Never both, never neither.
 *
 * SAM-61 — a prescription can be reported WITHOUT an execution ("não
 * realizei", manual record without a watch): then only `workoutAssignmentId`
 * is set (CHECK in migration 0069). RPE is optional (only when requested).
 */
export const athleteFeedbackSchema = z.strictObject({
  id,
  workoutExecutionId:  id.nullable(),
  workoutAssignmentId: id.nullable(),
  activityId:          id.nullable(),
  athleteId:           id,
  rpe:                 rpeSchema.nullable(),
  mood:                moodSchema.nullable(),
  energy:              energySchema.nullable(),
  comment:             z.string().max(2000).nullable(),
  createdAt:           z.date().transform((d) => new Date(d)),
  updatedAt:           z.date().transform((d) => new Date(d)),
  completion:          z.enum(["FULL", "PARTIAL", "NOT_DONE"]).nullable().optional(),
  rpeScale:            z.string().max(20).nullable().optional(),
  rpeCollectedAt:      z.date().nullable().optional(),
  difficulty:          z.number().int().min(1).max(5).nullable().optional(),
  adaptationReason:    z.string().max(40).nullable().optional(),
  adaptationNote:      z.string().max(1000).nullable().optional(),
  painReported:        z.boolean().optional(),
  painNote:            z.string().max(1000).nullable().optional(),
  attachmentUrl:       z.string().max(500).nullable().optional(),
}).superRefine((feedback, ctx) => {
  if ((feedback.activityId !== null) === (feedback.workoutAssignmentId !== null)) {
    ctx.addIssue({ code: "custom", path: ["workoutAssignmentId"], message: "Feedback pertence a uma prescrição OU a uma atividade." });
  }
  if (feedback.workoutExecutionId !== null && feedback.workoutAssignmentId === null) {
    ctx.addIssue({ code: "custom", path: ["workoutAssignmentId"], message: "Feedback de execução precisa da prescrição." });
  }
});

export type AthleteFeedback = z.infer<typeof athleteFeedbackSchema>;

export type CreateAthleteFeedbackInput = {
  id: string;
  athleteId: string;
  rpe: number | null;
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
