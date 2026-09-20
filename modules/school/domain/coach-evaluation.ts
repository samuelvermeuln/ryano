/**
 * T222 — CoachEvaluation entity
 * T224 — Score validations
 *
 * The coach posts a score 0.0–10.0 (stored as integer 0–100).
 * This is the COACH score — deliberately separate from the automated
 * compliance (ryvanoScore) so they can diverge without either being lost.
 */
import { z } from "zod";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

/**
 * T224 — overallScore is stored as 0–100 integer
 * (represents 0.0–10.0 with one decimal of precision).
 * Accepted inputs: integer 0–100 OR decimal 0.0–10.0
 * (auto-converted to the stored 0–100 integer form).
 */
export const coachScoreSchema = z
  .number()
  .finite()
  .min(0)
  .max(100)
  .transform((v) => {
    // Accept 0–10 decimal and auto-scale; values >10 treated as already-scaled 0–100
    return v <= 10 ? Math.round(v * 10) : Math.round(v);
  });

export const coachEvaluationSchema = z.strictObject({
  id,
  workoutExecutionId:  id,
  workoutAssignmentId: id,
  athleteId:           id,
  coachId:             id,
  schoolId:            id,
  overallScore:        z.number().int().min(0).max(100),
  note:                z.string().max(5000).nullable(),
  isVisible:           z.boolean(),
  createdAt:           z.date().transform((d) => new Date(d)),
  updatedAt:           z.date().transform((d) => new Date(d)),
});

export type CoachEvaluation = z.infer<typeof coachEvaluationSchema>;

export interface CreateCoachEvaluationInput {
  id: string;
  workoutExecutionId: string;
  workoutAssignmentId: string;
  athleteId: string;
  coachId: string;
  schoolId: string;
  overallScore: number;
  note?: string | null;
  isVisible?: boolean;
}

export function createCoachEvaluation(raw: CreateCoachEvaluationInput, now: Date): CoachEvaluation {
  return coachEvaluationSchema.parse({
    ...raw,
    note: raw.note ?? null,
    isVisible: raw.isVisible ?? true,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });
}

/** Presentation helper: converts internal 0–100 integer to 0.0–10.0 display value. */
export function displayScore(overallScore: number): number {
  return overallScore / 10;
}
