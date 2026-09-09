import { z } from "zod";
import { MembershipStatus } from "./enums";
import { SchoolError } from "./errors";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);
const identitySchema = z.strictObject({ id: opaqueId, schoolId: opaqueId, userId: opaqueId });

/** Validate both new and restored periods; ending a period never reopens it. */
export const schoolMembershipSchema = identitySchema.extend({
  status: z.enum(MembershipStatus),
  startedAt: z.date().nullable(),
  endedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}).superRefine((membership, ctx) => {
  const { status, startedAt, endedAt, createdAt, updatedAt } = membership;
  const invalid = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (updatedAt < createdAt) invalid("updatedAt", "Update cannot precede creation");
  if (startedAt && (startedAt < createdAt || startedAt > updatedAt)) {
    invalid("startedAt", "Start must be within the recorded period");
  }
  if (endedAt && (endedAt < (startedAt ?? createdAt) || endedAt > updatedAt)) {
    invalid("endedAt", "End must follow the period start and precede its last update");
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

export type SchoolMembership = z.infer<typeof schoolMembershipSchema>;
export type CreateSchoolMembershipInput = z.infer<typeof identitySchema>;

export function createSchoolMembership(raw: CreateSchoolMembershipInput, now: Date): SchoolMembership {
  const identity = identitySchema.parse(raw);
  z.date().parse(now);
  return {
    ...identity,
    status: MembershipStatus.PENDING,
    startedAt: null,
    endedAt: null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

/** Pure transition only; authorization and persistence belong to later use cases. */
export function transitionSchoolMembership(
  raw: SchoolMembership,
  status: MembershipStatus,
  now: Date,
): SchoolMembership {
  const membership = schoolMembershipSchema.parse(raw);
  z.date().min(membership.updatedAt).parse(now);
  const allowed = membership.status === MembershipStatus.PENDING
    ? status === MembershipStatus.ACTIVE || status === MembershipStatus.REJECTED
    : membership.status === MembershipStatus.ACTIVE
      && (status === MembershipStatus.ENDED || status === MembershipStatus.REVOKED);
  if (!allowed) {
    throw new SchoolError("SCHOOL_MEMBERSHIP_INVALID_TRANSITION", "Transição de vínculo escolar inválida.", 409);
  }
  return schoolMembershipSchema.parse({
    ...membership,
    status,
    createdAt: new Date(membership.createdAt),
    updatedAt: new Date(now),
    startedAt: status === MembershipStatus.ACTIVE
      ? new Date(now)
      : membership.startedAt && new Date(membership.startedAt),
    endedAt: status === MembershipStatus.ACTIVE ? null : new Date(now),
  });
}
