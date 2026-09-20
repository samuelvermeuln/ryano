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

export const athleteFeedbackSchema = z.strictObject({
  id,
  workoutExecutionId:  id,
  workoutAssignmentId: id,
  athleteId:           id,
  rpe:                 rpeSchema,
  mood:                moodSchema.nullable(),
  energy:              energySchema.nullable(),
  comment:             z.string().max(2000).nullable(),
  createdAt:           z.date().transform((d) => new Date(d)),
  updatedAt:           z.date().transform((d) => new Date(d)),
});

export type AthleteFeedback = z.infer<typeof athleteFeedbackSchema>;

export interface CreateAthleteFeedbackInput {
  id: string;
  workoutExecutionId: string;
  workoutAssignmentId: string;
  athleteId: string;
  rpe: number;
  mood?: number | null;
  energy?: number | null;
  comment?: string | null;
}

export function createAthleteFeedback(raw: CreateAthleteFeedbackInput, now: Date): AthleteFeedback {
  return athleteFeedbackSchema.parse({
    ...raw,
    mood:    raw.mood    ?? null,
    energy:  raw.energy  ?? null,
    comment: raw.comment ?? null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });
}
