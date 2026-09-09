import { z } from "zod";
import { MembershipJoinSource, MembershipStatus } from "./enums";
import { SchoolError } from "./errors";

const id = z.string().min(1).refine((value) => value.trim() === value);
const date = z.date().transform((value) => new Date(value));
const identity = z.strictObject({ id, schoolId: id, athleteId: id, joinSource: z.enum(MembershipJoinSource) });

export const schoolAthleteMembershipSchema = identity.extend({
  status: z.enum(MembershipStatus), startedAt: date.nullable(), endedAt: date.nullable(),
  approvedBy: id.nullable(), approvedAt: date.nullable(), rejectedBy: id.nullable(), rejectedAt: date.nullable(), revokedBy: id.nullable(), revokedAt: date.nullable(),
  createdAt: date, updatedAt: date,
}).superRefine((value, ctx) => {
  const fail = (path: string) => ctx.addIssue({ code: "custom", path: [path], message: "Inconsistent temporal athlete membership" });
  if (value.updatedAt < value.createdAt) fail("updatedAt");
  if (value.status === MembershipStatus.PENDING && (value.startedAt || value.endedAt)) fail("status");
  if (value.status === MembershipStatus.ACTIVE && (!value.startedAt || value.endedAt || !value.approvedAt)) fail("status");
  if (value.status === MembershipStatus.REJECTED && (value.startedAt || !value.endedAt || !value.rejectedAt)) fail("status");
  if (value.status === MembershipStatus.ENDED && (!value.startedAt || !value.endedAt)) fail("status");
  if (value.status === MembershipStatus.REVOKED && (!value.startedAt || !value.endedAt || !value.revokedAt)) fail("status");
});

export type SchoolAthleteMembership = z.infer<typeof schoolAthleteMembershipSchema>;
export type CreateSchoolAthleteMembershipInput = z.infer<typeof identity>;

export function createSchoolAthleteMembership(raw: CreateSchoolAthleteMembershipInput, now: Date): SchoolAthleteMembership {
  return schoolAthleteMembershipSchema.parse({ ...identity.parse(raw), status: MembershipStatus.PENDING, startedAt: null, endedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, revokedBy: null, revokedAt: null, createdAt: now, updatedAt: now });
}

export function transitionSchoolAthleteMembership(raw: SchoolAthleteMembership, status: MembershipStatus, now: Date, actorId?: string): SchoolAthleteMembership {
  const membership = schoolAthleteMembershipSchema.parse(raw);
  z.date().min(membership.updatedAt).parse(now);
  const allowed = membership.status === MembershipStatus.PENDING ? [MembershipStatus.ACTIVE, MembershipStatus.REJECTED].includes(status) : membership.status === MembershipStatus.ACTIVE && [MembershipStatus.ENDED, MembershipStatus.REVOKED].includes(status);
  if (!allowed) throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_INVALID_TRANSITION", "Transição de vínculo do atleta inválida.", 409);
  const actor = actorId ? id.parse(actorId) : null;
  return schoolAthleteMembershipSchema.parse({ ...membership, status, updatedAt: now, startedAt: status === MembershipStatus.ACTIVE ? now : membership.startedAt, endedAt: status === MembershipStatus.ACTIVE ? null : now, approvedBy: status === MembershipStatus.ACTIVE ? actor : membership.approvedBy, approvedAt: status === MembershipStatus.ACTIVE ? now : membership.approvedAt, rejectedBy: status === MembershipStatus.REJECTED ? actor : membership.rejectedBy, rejectedAt: status === MembershipStatus.REJECTED ? now : membership.rejectedAt, revokedBy: status === MembershipStatus.REVOKED ? actor : membership.revokedBy, revokedAt: status === MembershipStatus.REVOKED ? now : membership.revokedAt });
}
