/**
 * The block format of a prescription — and, since SAM-58, of a catalog
 * template version: one builder, one schema (moved here from
 * prescribe-workout-to-athlete.ts so the domain owns it).
 */
import { z } from "zod";
import { WorkoutBlockType } from "./enums";

/**
 * A block's intensity targets. Superset of what `describeBlockTargets`
 * (modules/school/presentation/workout-blocks.ts) knows how to render, so
 * anything accepted here has a display form — the two must not drift.
 */
export const prescriptionTargetSchema = z.strictObject({
  heartRateMin: z.number().int().min(30).max(260).optional(),
  heartRateMax: z.number().int().min(30).max(260).optional(),
  power: z.number().int().min(10).max(3000).optional(),
  paceSecPerKm: z.number().int().min(60).max(1800).optional(),
  paceSec100m: z.number().int().min(30).max(600).optional(),
  zone: z.number().int().min(1).max(5).optional(),
  rpe: z.number().int().min(1).max(10).optional(),
}).superRefine((target, ctx) => {
  if (
    target.heartRateMin !== undefined
    && target.heartRateMax !== undefined
    && target.heartRateMin > target.heartRateMax
  ) {
    ctx.addIssue({ code: "custom", path: ["heartRateMax"], message: "A FC mínima não pode ser maior que a máxima." });
  }
});

export type PrescriptionTarget = z.infer<typeof prescriptionTargetSchema>;

export const prescriptionBlockSchema = z.strictObject({
  blockType: z.enum(WorkoutBlockType),
  title: z.string().trim().min(1).max(200).nullish().transform((v) => v ?? null),
  durationS: z.number().int().min(1).max(86_400).nullish().transform((v) => v ?? null),
  distanceM: z.number().finite().min(1).max(1_000_000).nullish().transform((v) => v ?? null),
  repetitions: z.number().int().min(1).max(200).nullish().transform((v) => v ?? null),
  target: prescriptionTargetSchema.optional(),
  rest: prescriptionTargetSchema.optional(),
  restDurationS: z.number().int().min(1).max(7_200).nullish().transform((v) => v ?? null),
}).superRefine((block, ctx) => {
  if (block.durationS === null && block.distanceM === null) {
    ctx.addIssue({
      code: "custom",
      path: ["durationS"],
      message: "Cada bloco precisa de duração ou distância.",
    });
  }
});

export type PrescriptionBlock = z.infer<typeof prescriptionBlockSchema>;

/** Snapshot block rows (DB/snapshot shape) back to the prescription block format. */
export function prescriptionBlocksOfRows(rows: ReadonlyArray<Record<string, unknown>>): PrescriptionBlock[] {
  return rows.map((row) => {
    const target = (row.targetPayload ?? null) as Record<string, number> | null;
    const rest = (row.restPayload ?? null) as Record<string, number> | null;
    const { durationS: restDurationS, ...restTargets } = rest ?? {};
    return {
      blockType: row.blockType as PrescriptionBlock["blockType"],
      title: (row.title as string | null) ?? null,
      durationS: (row.durationS as number | null) ?? null,
      distanceM: row.distanceM == null ? null : Number(row.distanceM),
      repetitions: (row.repetitions as number | null) ?? null,
      ...(target ? { target } : {}),
      ...(Object.keys(restTargets).length > 0 ? { rest: restTargets } : {}),
      restDurationS: typeof restDurationS === "number" ? restDurationS : null,
    };
  });
}
