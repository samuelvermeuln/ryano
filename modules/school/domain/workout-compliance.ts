/**
 * T191 — WorkoutCompliance entity
 * T206 — algorithm_version
 */
import { z } from "zod";

const opaqueId = z.string().min(1).max(256).refine((v) => v.trim() === v);

export const complianceBreakdownSchema = z.object({
  distance:   z.number().int().min(0).max(100).optional(),
  duration:   z.number().int().min(0).max(100).optional(),
  pace:       z.number().int().min(0).max(100).optional(),
  heartRate:  z.number().int().min(0).max(100).optional(),
  power:      z.number().int().min(0).max(100).optional(),
  intervals:  z.number().int().min(0).max(100).optional(),
  rest:       z.number().int().min(0).max(100).optional(),
  zones:      z.number().int().min(0).max(100).optional(),
  /** SAM-72 — intensity adherence of the main series by sample, always with its coverage (§17.4). */
  adherence:  z.number().min(0).max(100).optional(),
  coverage:   z.number().min(0).max(100).optional(),
});

export type ComplianceBreakdown = z.infer<typeof complianceBreakdownSchema>;

export const workoutComplianceSchema = z.strictObject({
  id:                  opaqueId,
  workoutExecutionId:  opaqueId,
  workoutAssignmentId: opaqueId,
  athleteId:           opaqueId,
  overallScore:        z.number().int().min(0).max(100),
  breakdown:           complianceBreakdownSchema,
  strategyKey:         z.string().min(1).max(50),
  algorithmVersion:    z.number().int().min(1),
  calculatedAt:        z.date(),
  createdAt:           z.date(),
  updatedAt:           z.date(),
});

export type WorkoutCompliance = z.infer<typeof workoutComplianceSchema>;

/**
 * T206 — Current algorithm version.
 * Bump this number whenever the scoring formula or weights change so
 * compliance records can be identified as belonging to a specific algorithm.
 *
 * 1 — totals without repetitions; heart rate against the first block's range.
 * 2 — SAM-19 (ADR-006 v2): Σ reps × (duration + rest) totals, intensity per
 *     block against laps or the duration-weighted target of the main blocks,
 *     `zones` from laps in range; rows at version 1 are left as they are.
 * 3 — SAM-48: rest counted between repetitions (6 × 100 m with 20 s = five
 *     pauses, §11.2), not after every one; no measurable dimension yields no
 *     record instead of a score of 0.
 * 4 — SAM-72 (ADR-006 v4): `adherence` (time in band ÷ time measured) and
 *     `coverage` (time measured ÷ evaluable time) of the main series from the
 *     activity's samples; the score itself is unchanged, the pair is context.
 */
export const COMPLIANCE_ALGORITHM_VERSION = 4;

export function createWorkoutCompliance(
  raw: Omit<WorkoutCompliance, "createdAt" | "updatedAt">,
  now: Date,
): WorkoutCompliance {
  return workoutComplianceSchema.parse({ ...raw, createdAt: new Date(now), updatedAt: new Date(now) });
}
