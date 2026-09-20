import { z } from "zod";
import { TrainingLicenseStatus } from "./enums";

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);
const nullableId = id.nullable();
const copiedDate = z.date().transform((v) => new Date(v));
const nullableDate = copiedDate.nullable();

export const trainingLicenseSchema = z.strictObject({
  id,
  productId: id,
  versionId: id,
  purchaseId: nullableId,
  athleteId: id,
  status: z.enum(TrainingLicenseStatus),
  startedAt: nullableDate,
  expiresAt: nullableDate,
  revokedAt: nullableDate,
  /** Set to true after calendar assignment backfill completes (T406). */
  calendarInstantiated: z.boolean(),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((l, ctx) => {
  if (l.status === TrainingLicenseStatus.REVOKED && l.revokedAt === null) {
    ctx.addIssue({ code: "custom", path: ["revokedAt"], message: "revokedAt is required when status is REVOKED" });
  }
  if (l.revokedAt !== null && l.status !== TrainingLicenseStatus.REVOKED) {
    ctx.addIssue({ code: "custom", path: ["revokedAt"], message: "revokedAt is only allowed when status is REVOKED" });
  }
  if (l.expiresAt !== null && l.startedAt !== null && l.expiresAt <= l.startedAt) {
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "expiresAt must be after startedAt" });
  }
  if (l.updatedAt < l.createdAt) {
    ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  }
});

export type TrainingLicense = z.infer<typeof trainingLicenseSchema>;
export type CreateTrainingLicenseInput = Omit<TrainingLicense, "status" | "calendarInstantiated" | "createdAt" | "updatedAt"> & {
  status?: TrainingLicenseStatus;
};

export function createTrainingLicense(raw: CreateTrainingLicenseInput, now: Date): TrainingLicense {
  return trainingLicenseSchema.parse({
    ...raw,
    status: raw.status ?? TrainingLicenseStatus.ACTIVE,
    calendarInstantiated: false,
    createdAt: now,
    updatedAt: now,
  });
}
