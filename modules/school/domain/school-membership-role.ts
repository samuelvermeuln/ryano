import { z } from "zod";
import { SchoolRole } from "./enums";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);
const assignmentSchema = z.strictObject({
  id: opaqueId,
  membershipId: opaqueId,
  role: z.enum(SchoolRole),
});

/** A school role belongs to one membership period, independently of global auth. */
export const schoolMembershipRoleSchema = assignmentSchema.extend({
  createdAt: z.date(),
});

export type SchoolMembershipRole = z.infer<typeof schoolMembershipRoleSchema>;
export type CreateSchoolMembershipRoleInput = z.infer<typeof assignmentSchema>;

export function createSchoolMembershipRole(
  raw: CreateSchoolMembershipRoleInput,
  now: Date,
): SchoolMembershipRole {
  const assignment = assignmentSchema.parse(raw);
  z.date().parse(now);
  return { ...assignment, createdAt: new Date(now) };
}
