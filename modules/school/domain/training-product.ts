import { z } from "zod";
import { TrainingProductStatus, TrainingProductVisibility } from "./enums";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);
const nullableId = id.nullable();
const copiedDate = z.date().transform((v) => new Date(v));

export const trainingProductSchema = z.strictObject({
  id,
  schoolId: nullableId,
  coachId: nullableId,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable(),
  sportType: z.string().trim().min(1).max(100).nullable(),
  durationWeeks: z.number().int().min(1).max(520).nullable(),
  status: z.enum(TrainingProductStatus),
  visibility: z.enum(TrainingProductVisibility),
  /** Price in minor currency units (centavos, cents). null means free. */
  priceCents: z.number().int().min(0).nullable(),
  currency: z.string().length(3).toUpperCase().nullable(),
  currentVersionId: nullableId,
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((p, ctx) => {
  if (!p.schoolId && !p.coachId) {
    ctx.addIssue({ code: "custom", path: ["schoolId"], message: "Product must be owned by a school or a coach" });
  }
  if (p.schoolId && p.coachId) {
    ctx.addIssue({ code: "custom", path: ["coachId"], message: "Product cannot have both schoolId and coachId" });
  }
  if ((p.priceCents !== null) !== (p.currency !== null)) {
    ctx.addIssue({ code: "custom", path: ["currency"], message: "priceCents and currency must both be set or both be null" });
  }
  if (p.updatedAt < p.createdAt) {
    ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  }
});

export type TrainingProduct = z.infer<typeof trainingProductSchema>;
export type CreateTrainingProductInput = Omit<TrainingProduct, "status" | "currentVersionId" | "createdAt" | "updatedAt"> & {
  status?: TrainingProductStatus;
};

export function createTrainingProduct(raw: CreateTrainingProductInput, now: Date): TrainingProduct {
  return trainingProductSchema.parse({
    ...raw,
    status: raw.status ?? TrainingProductStatus.DRAFT,
    currentVersionId: null,
    createdAt: now,
    updatedAt: now,
  });
}
