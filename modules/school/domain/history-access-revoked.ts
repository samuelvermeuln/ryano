import { z } from "zod";
import { HistoryGrantStatus } from "./enums";
import { historyAccessGrantSchema } from "./history-access-grant";

/** Immutable audit event derived after a consent record is revoked. */
export const historyAccessRevokedSchema = z.strictObject({
  type: z.literal("HistoryAccessRevoked"),
  grantId: historyAccessGrantSchema.shape.id,
  athleteId: historyAccessGrantSchema.shape.athleteId,
  granteeType: historyAccessGrantSchema.shape.granteeType,
  granteeId: historyAccessGrantSchema.shape.granteeId,
  revokedBy: historyAccessGrantSchema.shape.revokedBy,
  occurredAt: z.date().transform((value) => new Date(value)),
});

export type HistoryAccessRevoked = z.infer<typeof historyAccessRevokedSchema>;

export function createHistoryAccessRevoked(raw: unknown): HistoryAccessRevoked {
  const grant = historyAccessGrantSchema.parse(raw);
  if (grant.status !== HistoryGrantStatus.REVOKED || !grant.revokedBy || !grant.revokedAt) {
    throw new Error("HistoryAccessRevoked requires a revoked history access grant");
  }
  return historyAccessRevokedSchema.parse({
    type: "HistoryAccessRevoked",
    grantId: grant.id,
    athleteId: grant.athleteId,
    granteeType: grant.granteeType,
    granteeId: grant.granteeId,
    revokedBy: grant.revokedBy,
    occurredAt: grant.revokedAt,
  });
}
