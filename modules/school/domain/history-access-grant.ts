import { z } from "zod";
import { HistoryGranteeType, HistoryGrantStatus } from "./enums";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));
const calendarDate = copiedDate.refine((value) => value.getUTCHours() === 0
  && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0,
"History periods use UTC calendar dates");

/** Every category requires an explicit choice; omitted categories never imply consent. */
export const historyGrantScopeSchema = z.strictObject({
  activities: z.boolean(),
  metrics: z.boolean(),
  prescribedWorkouts: z.boolean(),
  compliance: z.boolean(),
  coachScores: z.boolean(),
  coachComments: z.boolean(),
  assessments: z.boolean(),
  athleteFeedback: z.boolean(),
});

const identitySchema = z.strictObject({
  id: opaqueId,
  athleteId: opaqueId,
  granteeType: z.enum(HistoryGranteeType),
  granteeId: opaqueId,
  schoolId: opaqueId.nullable(),
  coachId: opaqueId.nullable(),
  scope: historyGrantScopeSchema,
  fromDate: calendarDate.nullable(),
  toDate: calendarDate.nullable(),
  grantedBy: opaqueId,
});

/** Historical data period is independent of the consent lifecycle (ADR-005). */
export const historyAccessGrantSchema = identitySchema.extend({
  status: z.enum(HistoryGrantStatus),
  grantedAt: copiedDate,
  revokedBy: opaqueId.nullable(),
  revokedAt: copiedDate.nullable(),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((grant, ctx) => {
  const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  const school = grant.granteeType === HistoryGranteeType.SCHOOL;
  if (school ? grant.schoolId !== grant.granteeId || grant.coachId !== null
    : grant.coachId !== grant.granteeId || grant.schoolId !== null) {
    fail("granteeId", "Recipient must match exactly one school or coach");
  }
  if (grant.grantedBy !== grant.athleteId) fail("grantedBy", "Historical access requires athlete consent");
  if (grant.fromDate && grant.toDate && grant.fromDate > grant.toDate) fail("toDate", "Period end must follow its start");
  if (grant.updatedAt < grant.createdAt) fail("updatedAt", "Update cannot precede creation");
  if (grant.grantedAt < grant.createdAt || grant.grantedAt > grant.updatedAt) fail("grantedAt", "Consent must fall between creation and last update");
  if (grant.status === HistoryGrantStatus.REVOKED) {
    if (!grant.revokedBy || !grant.revokedAt) fail("revokedAt", "Revoked consent requires actor and timestamp");
  } else if (grant.revokedBy !== null || grant.revokedAt !== null) {
    fail("revokedAt", "Revocation metadata requires revoked status");
  }
  if (grant.revokedAt && (grant.revokedAt < grant.grantedAt || grant.revokedAt > grant.updatedAt)) {
    fail("revokedAt", "Revocation must fall between consent and last update");
  }
});

export type HistoryGrantScope = z.infer<typeof historyGrantScopeSchema>;
export type HistoryAccessGrant = z.infer<typeof historyAccessGrantSchema>;
export type CreateHistoryAccessGrantInput = z.infer<typeof identitySchema>;

export function createHistoryAccessGrant(raw: CreateHistoryAccessGrantInput, now: Date): HistoryAccessGrant {
  return historyAccessGrantSchema.parse({
    ...identitySchema.parse(raw), status: HistoryGrantStatus.ACTIVE,
    grantedAt: now, revokedBy: null, revokedAt: null, createdAt: now, updatedAt: now,
  });
}
