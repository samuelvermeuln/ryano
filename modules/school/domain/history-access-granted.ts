import { z } from "zod";
import { historyAccessGrantSchema } from "./history-access-grant";

const grantId = historyAccessGrantSchema.shape.id;

/** Immutable audit event derived from an athlete's explicit consent record. */
export const historyAccessGrantedSchema = z.strictObject({
  type: z.literal("HistoryAccessGranted"),
  grantId,
  athleteId: historyAccessGrantSchema.shape.athleteId,
  granteeType: historyAccessGrantSchema.shape.granteeType,
  granteeId: historyAccessGrantSchema.shape.granteeId,
  scope: historyAccessGrantSchema.shape.scope,
  fromDate: historyAccessGrantSchema.shape.fromDate,
  toDate: historyAccessGrantSchema.shape.toDate,
  occurredAt: z.date().transform((value) => new Date(value)),
});

export type HistoryAccessGranted = z.infer<typeof historyAccessGrantedSchema>;

export function createHistoryAccessGranted(raw: unknown): HistoryAccessGranted {
  const grant = historyAccessGrantSchema.parse(raw);
  return historyAccessGrantedSchema.parse({
    type: "HistoryAccessGranted",
    grantId: grant.id,
    athleteId: grant.athleteId,
    granteeType: grant.granteeType,
    granteeId: grant.granteeId,
    scope: grant.scope,
    fromDate: grant.fromDate,
    toDate: grant.toDate,
    occurredAt: grant.grantedAt,
  });
}
