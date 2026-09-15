import { z } from "zod";
import { coachSchoolMembershipSchema, type CoachSchoolMembership } from "./coach-school-membership";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);

/** Internal domain contract; adapters serialize endedAt as UTC ISO 8601. */
export const coachLeftSchoolSchema = z.strictObject({
  type: z.literal("CoachLeftSchool"),
  membershipId: opaqueId,
  schoolId: opaqueId,
  coachId: opaqueId,
  endedAt: z.date().transform((value) => new Date(value)),
  reason: z.literal("REMOVED_BY_ADMIN"),
});

export type CoachLeftSchool = z.infer<typeof coachLeftSchoolSchema>;

/** Derive from the membership returned after RemoveCoachFromSchool commits. */
export function createCoachLeftSchool(raw: CoachSchoolMembership): CoachLeftSchool {
  const membership = coachSchoolMembershipSchema.parse(raw);
  z.literal("ENDED").parse(membership.status);
  return coachLeftSchoolSchema.parse({
    type: "CoachLeftSchool",
    membershipId: membership.id,
    schoolId: membership.schoolId,
    coachId: membership.coachId,
    endedAt: membership.endedAt,
    reason: "REMOVED_BY_ADMIN",
  });
}
