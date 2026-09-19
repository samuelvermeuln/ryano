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
 */
export const COMPLIANCE_ALGORITHM_VERSION = 1;

export function createWorkoutCompliance(
  raw: Omit<WorkoutCompliance, "createdAt" | "updatedAt">,
  now: Date,
): WorkoutCompliance {
  return workoutComplianceSchema.parse({ ...raw, createdAt: new Date(now), updatedAt: new Date(now) });
}
