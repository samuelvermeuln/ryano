import { z } from "zod";
import { TrainingPurchaseStatus } from "./enums";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);
const copiedDate = z.date().transform((v) => new Date(v));

export const trainingPurchaseSchema = z.strictObject({
  id,
  productId: id,
  athleteId: id,
  /** External payment reference (Stripe charge, PIX txid). null for free products. */
  paymentRef: z.string().max(500).nullable(),
  pricePaid: z.number().int().min(0).nullable(),
  currency: z.string().length(3).toUpperCase().nullable(),
  status: z.enum(TrainingPurchaseStatus),
  purchasedAt: copiedDate,
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((p, ctx) => {
  if ((p.pricePaid !== null) !== (p.currency !== null)) {
    ctx.addIssue({ code: "custom", path: ["currency"], message: "pricePaid and currency must both be set or both be null" });
  }
  if (p.updatedAt < p.createdAt) {
    ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  }
});

export type TrainingPurchase = z.infer<typeof trainingPurchaseSchema>;
export type CreateTrainingPurchaseInput = Omit<TrainingPurchase, "status" | "purchasedAt" | "createdAt" | "updatedAt"> & {
  status?: TrainingPurchaseStatus;
};

export function createTrainingPurchase(raw: CreateTrainingPurchaseInput, now: Date): TrainingPurchase {
  return trainingPurchaseSchema.parse({
    ...raw,
    status: raw.status ?? TrainingPurchaseStatus.PENDING,
    purchasedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}
