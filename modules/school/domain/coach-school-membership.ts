import { z } from "zod";
import { MembershipStatus } from "./enums";
import { SchoolError } from "./errors";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);
const identitySchema = z.strictObject({ id: opaqueId, coachId: opaqueId, schoolId: opaqueId });
const copiedDate = z.date().transform((date) => new Date(date));

/** A temporal school link references the independent coach profile, not a global role. */
export const coachSchoolMembershipSchema = identitySchema.extend({
  status: z.enum(MembershipStatus),
  requestedAt: copiedDate,
  decidedAt: copiedDate.nullable(),
  startedAt: copiedDate.nullable(),
  endedAt: copiedDate.nullable(),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((membership, ctx) => {
  const { status, requestedAt, decidedAt, startedAt, endedAt, createdAt, updatedAt } = membership;
  const invalid = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (updatedAt < createdAt) invalid("updatedAt", "Update cannot precede creation");
  if (requestedAt < createdAt || requestedAt > updatedAt) {
    invalid("requestedAt", "Request must be within the recorded period");
  }
  if (decidedAt && (decidedAt < requestedAt || decidedAt > updatedAt)) {
    invalid("decidedAt", "Decision must follow the request and precede its last update");
  }
  if (startedAt && (startedAt < (decidedAt ?? requestedAt) || startedAt > updatedAt)) {
    invalid("startedAt", "Start must follow approval and precede its last update");
  }
  if (endedAt && (endedAt < (startedAt ?? decidedAt ?? requestedAt) || endedAt > updatedAt)) {
    invalid("endedAt", "End must follow the period start or decision and precede its last update");
  }
  if (status === MembershipStatus.PENDING) {
    if (decidedAt !== null) invalid("decidedAt", "Pending request cannot have a decision");
  } else if (decidedAt === null) {
    invalid("decidedAt", "Decided membership requires a decision date");
  }
  if (status === MembershipStatus.PENDING || status === MembershipStatus.REJECTED) {
    if (startedAt !== null) invalid("startedAt", "Unapproved membership has no effective start");
  } else if (startedAt === null) {
    invalid("startedAt", "Approved membership requires an effective start");
  }
  if (status === MembershipStatus.PENDING || status === MembershipStatus.ACTIVE) {
    if (endedAt !== null) invalid("endedAt", "Open membership cannot have an end");
  } else if (endedAt === null) {
    invalid("endedAt", "Closed membership requires an end");
  }
});

export type CoachSchoolMembership = z.infer<typeof coachSchoolMembershipSchema>;
export type CreateCoachSchoolMembershipInput = z.infer<typeof identitySchema>;

export function createCoachSchoolMembership(raw: CreateCoachSchoolMembershipInput, now: Date): CoachSchoolMembership {
  const identity = identitySchema.parse(raw);
  return coachSchoolMembershipSchema.parse({
    ...identity,
    status: MembershipStatus.PENDING,
    requestedAt: now,
    decidedAt: null,
    startedAt: null,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

/** Pure transition; authorization and persistence belong to the application layer. */
export function transitionCoachSchoolMembership(
  raw: CoachSchoolMembership,
  status: MembershipStatus,
  now: Date,
): CoachSchoolMembership {
  const membership = coachSchoolMembershipSchema.parse(raw);
  z.date().min(membership.updatedAt).parse(now);
  const allowed = membership.status === MembershipStatus.PENDING
    ? status === MembershipStatus.ACTIVE || status === MembershipStatus.REJECTED
    : membership.status === MembershipStatus.ACTIVE
      && (status === MembershipStatus.ENDED || status === MembershipStatus.REVOKED);
  if (!allowed) {
    throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_INVALID_TRANSITION", "Transição de vínculo do professor inválida.", 409);
  }
  return coachSchoolMembershipSchema.parse({
    ...membership,
    status,
    updatedAt: now,
    decidedAt: membership.decidedAt ?? now,
    startedAt: status === MembershipStatus.ACTIVE ? now : membership.startedAt,
    endedAt: status === MembershipStatus.ACTIVE ? null : now,
  });
}
