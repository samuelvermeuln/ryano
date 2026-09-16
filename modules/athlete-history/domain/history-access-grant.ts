import { z } from "zod";
import { HistoryGranteeType, HistoryGrantStatus } from "@/modules/school/domain/enums";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));

export const historyAccessScopeSchema = z.strictObject({
  activities: z.boolean(),
  metrics: z.boolean(),
  prescribedWorkouts: z.boolean(),
  compliance: z.boolean(),
  coachScores: z.boolean(),
  coachComments: z.boolean(),
  assessments: z.boolean(),
  athleteFeedback: z.boolean(),
}).refine((scope) => Object.values(scope).some(Boolean), {
  message: "At least one history category must be shared",
});

const identitySchema = z.strictObject({
  id: opaqueId,
  athleteId: opaqueId,
  granteeType: z.enum(HistoryGranteeType),
  granteeId: opaqueId,
  schoolId: opaqueId.nullable(),
  coachId: opaqueId.nullable(),
  scope: historyAccessScopeSchema,
  fromDate: copiedDate.nullable(),
  toDate: copiedDate.nullable(),
  grantedBy: opaqueId,
});

export const historyAccessGrantSchema = identitySchema.extend({
  status: z.enum(HistoryGrantStatus),
  grantedAt: copiedDate,
  revokedBy: opaqueId.nullable(),
  revokedAt: copiedDate.nullable(),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((grant, ctx) => {
  const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  const isSchoolGrant = grant.granteeType === HistoryGranteeType.SCHOOL;

  if (isSchoolGrant !== (grant.schoolId !== null)) fail("schoolId", "School recipient must match grantee type");
  if (!isSchoolGrant !== (grant.coachId !== null)) fail("coachId", "Coach recipient must match grantee type");
  if ((isSchoolGrant ? grant.schoolId : grant.coachId) !== grant.granteeId) {
    fail("granteeId", "Grantee ID must match the typed recipient");
  }
  if (grant.fromDate && grant.toDate && grant.fromDate > grant.toDate) {
    fail("toDate", "End date cannot precede start date");
  }
  if ((grant.status === HistoryGrantStatus.REVOKED) !== (grant.revokedAt !== null)) {
    fail("revokedAt", "Revocation date must match revoked status");
  }
  if (grant.revokedBy !== null && grant.revokedAt === null) {
    fail("revokedBy", "Revocation actor requires a revocation date");
  }
  if (grant.updatedAt < grant.createdAt || grant.grantedAt < grant.createdAt) {
    fail("updatedAt", "Grant timestamps must not precede creation");
  }
});

export type HistoryAccessScope = z.infer<typeof historyAccessScopeSchema>;
export type HistoryAccessGrant = z.infer<typeof historyAccessGrantSchema>;
export type CreateHistoryAccessGrantInput = z.infer<typeof identitySchema>;

export function createHistoryAccessGrant(raw: CreateHistoryAccessGrantInput, now: Date): HistoryAccessGrant {
  const identity = identitySchema.parse(raw);
  return historyAccessGrantSchema.parse({
    ...identity,
    status: HistoryGrantStatus.ACTIVE,
    grantedAt: now,
    revokedBy: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}
