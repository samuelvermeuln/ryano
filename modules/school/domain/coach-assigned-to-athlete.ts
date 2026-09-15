import { z } from "zod";
import { coachAthleteAssignmentSchema, type CoachAthleteAssignment } from "./coach-athlete-assignment";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);

/** Internal domain contract; adapters serialize occurredAt as UTC ISO 8601. */
export const coachAssignedToAthleteSchema = z.strictObject({
  type: z.literal("CoachAssignedToAthlete"),
  assignmentId: opaqueId,
  schoolId: opaqueId.nullable(),
  athleteId: opaqueId,
  coachId: opaqueId,
  assignedBy: opaqueId.nullable(),
  isPrimary: z.boolean(),
  sportType: z.string().min(1).nullable(),
  occurredAt: z.date().transform((value) => new Date(value)),
});

export type CoachAssignedToAthlete = z.infer<typeof coachAssignedToAthleteSchema>;

/** Derive only from an activated assignment; its period ID identifies this event. */
export function createCoachAssignedToAthlete(raw: CoachAthleteAssignment): CoachAssignedToAthlete {
  const assignment = coachAthleteAssignmentSchema.parse(raw);
  z.literal("ACTIVE").parse(assignment.status);
  return coachAssignedToAthleteSchema.parse({
    type: "CoachAssignedToAthlete",
    assignmentId: assignment.id,
    schoolId: assignment.schoolId,
    athleteId: assignment.athleteId,
    coachId: assignment.coachId,
    assignedBy: assignment.assignedBy,
    isPrimary: assignment.isPrimary,
    sportType: assignment.sportType,
    occurredAt: assignment.startedAt,
  });
}
