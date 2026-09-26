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
  /** Per-school pause. Distinct from ENDED: assignments survive and it reverses. */
  suspendedAt: copiedDate.nullable().default(null),
  suspendedBy: opaqueId.nullable().default(null),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((membership, ctx) => {
  const { status, requestedAt, decidedAt, startedAt, endedAt, createdAt, updatedAt } = membership;
  const { suspendedAt, suspendedBy } = membership;
  const invalid = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if ((suspendedAt === null) !== (suspendedBy === null)) {
    invalid("suspendedBy", "Suspension requires both the moment and its author");
  }
  if (suspendedAt && status !== MembershipStatus.ACTIVE) {
    invalid("suspendedAt", "Only an active link can be suspended");
  }
  if (suspendedAt && (suspendedAt < (startedAt ?? requestedAt) || suspendedAt > updatedAt)) {
    invalid("suspendedAt", "Suspension must follow the period start and precede its last update");
  }
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
    suspendedAt: null,
    suspendedBy: null,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Pauses or resumes a link without ending it, so athlete assignments and
 * prescription history survive untouched and the decision can be reversed.
 */
export function suspendCoachSchoolMembership(
  raw: CoachSchoolMembership,
  suspendedBy: string,
  now: Date,
): CoachSchoolMembership {
  const membership = coachSchoolMembershipSchema.parse(raw);
  z.date().min(membership.updatedAt).parse(now);
  if (membership.status !== MembershipStatus.ACTIVE) {
    throw new SchoolError(
      "COACH_SCHOOL_MEMBERSHIP_INVALID_TRANSITION",
      "Somente um vínculo ativo pode ser desativado.",
      409,
    );
  }
  if (membership.suspendedAt) {
    throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_CONFLICT", "O professor já está desativado.", 409);
  }
  return coachSchoolMembershipSchema.parse({
    ...membership,
    suspendedAt: now,
    suspendedBy: opaqueId.parse(suspendedBy),
    updatedAt: now,
  });
}

export function resumeCoachSchoolMembership(raw: CoachSchoolMembership, now: Date): CoachSchoolMembership {
  const membership = coachSchoolMembershipSchema.parse(raw);
  z.date().min(membership.updatedAt).parse(now);
  if (!membership.suspendedAt) {
    throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_CONFLICT", "O professor já está ativo.", 409);
  }
  return coachSchoolMembershipSchema.parse({
    ...membership,
    suspendedAt: null,
    suspendedBy: null,
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
    // Leaving the school absorbs a suspension: the closed period is no longer
    // merely paused, and only an ACTIVE link may carry suspension fields.
    suspendedAt: status === MembershipStatus.ACTIVE ? membership.suspendedAt : null,
    suspendedBy: status === MembershipStatus.ACTIVE ? membership.suspendedBy : null,
  });
}
