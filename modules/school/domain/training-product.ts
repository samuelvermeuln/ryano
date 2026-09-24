import { z } from "zod";
import { TrainingProductStatus, TrainingProductVisibility } from "./enums";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);
const nullableId = id.nullable();
const copiedDate = z.date().transform((v) => new Date(v));

// TM019/TM020 — commercial/catalog metadata added to the DB by TM003
// (migration 0036) but not yet reflected here: the domain schema is extended
// now, by the first use cases that actually read/write these fields. All
// nullable and optional on input (see `CreateTrainingProductInput` below) —
// a draft may be missing most of them until the author fills the editor;
// completeness is enforced at publish time (TM022), not at draft creation.

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
  slug: z.string().trim().max(220).nullable(),
  coverMediaId: nullableId,
  objective: z.string().trim().max(300).nullable(),
  difficulty: z.string().trim().max(50).nullable(),
  goalType: z.string().trim().max(50).nullable(),
  targetEventType: z.string().trim().max(50).nullable(),
  targetDistance: z.string().trim().max(50).nullable(),
  sessionsPerWeek: z.number().int().min(0).max(28).nullable(),
  sessionDurationMin: z.number().int().min(0).nullable(),
  sessionDurationMax: z.number().int().min(0).nullable(),
  weeklyMinutesMin: z.number().int().min(0).nullable(),
  weeklyMinutesMax: z.number().int().min(0).nullable(),
  sessionCount: z.number().int().min(0).nullable(),
  equipment: z.string().trim().max(500).nullable(),
  language: z.string().trim().max(10).nullable(),
  /** Marketing status text (e.g. "on sale") — distinct from `status`/`visibility`, which gate access. */
  availability: z.string().trim().max(100).nullable(),
  sellerPolicyVersion: z.string().trim().max(50).nullable(),
  previewVersionId: nullableId,
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

/** Keys added by TM019/TM020 that a caller may omit entirely on creation — defaulted to `null` below. */
type CommercialMetadataKeys = "slug" | "coverMediaId" | "objective" | "difficulty" | "goalType" | "targetEventType"
  | "targetDistance" | "sessionsPerWeek" | "sessionDurationMin" | "sessionDurationMax" | "weeklyMinutesMin"
  | "weeklyMinutesMax" | "sessionCount" | "equipment" | "language" | "availability" | "sellerPolicyVersion"
  | "previewVersionId";

export type CreateTrainingProductInput =
  Omit<TrainingProduct, "status" | "currentVersionId" | "createdAt" | "updatedAt" | CommercialMetadataKeys> & {
    status?: TrainingProductStatus;
  } & Partial<Pick<TrainingProduct, CommercialMetadataKeys>>;

const COMMERCIAL_METADATA_DEFAULTS: Record<CommercialMetadataKeys, null> = {
  slug: null, coverMediaId: null, objective: null, difficulty: null, goalType: null, targetEventType: null,
  targetDistance: null, sessionsPerWeek: null, sessionDurationMin: null, sessionDurationMax: null,
  weeklyMinutesMin: null, weeklyMinutesMax: null, sessionCount: null, equipment: null, language: null,
  availability: null, sellerPolicyVersion: null, previewVersionId: null,
};

export function createTrainingProduct(raw: CreateTrainingProductInput, now: Date): TrainingProduct {
  return trainingProductSchema.parse({
    ...COMMERCIAL_METADATA_DEFAULTS,
    ...raw,
    status: raw.status ?? TrainingProductStatus.DRAFT,
    currentVersionId: null,
    createdAt: now,
    updatedAt: now,
  });
}
