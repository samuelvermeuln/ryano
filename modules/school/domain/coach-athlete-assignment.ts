import { z } from "zod";
import { AssignmentStatus } from "./enums";
import { SchoolError } from "./errors";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);
const optionalSportType = z.string().min(1).refine((value) => value.trim() === value).nullable();
const copiedDate = z.date().transform((value) => new Date(value));
const identitySchema = z.strictObject({
  id: opaqueId,
  athleteId: opaqueId,
  coachId: opaqueId,
  schoolId: opaqueId.nullable(),
  isPrimary: z.boolean(),
  sportType: optionalSportType,
  /** Why this period was opened, when a transfer recorded a justification. */
  reason: z.string().trim().min(1).max(500).nullable().default(null),
});

export const coachAthleteAssignmentSchema = identitySchema.extend({
  status: z.enum(AssignmentStatus),
  startedAt: copiedDate.nullable(),
  endedAt: copiedDate.nullable(),
  assignedBy: opaqueId.nullable(),
  endedBy: opaqueId.nullable(),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((assignment, ctx) => {
  const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (assignment.updatedAt < assignment.createdAt) fail("updatedAt", "Update cannot precede creation");
  if (assignment.startedAt && assignment.startedAt > assignment.updatedAt) fail("startedAt", "Start must precede its last update");
  if (assignment.endedAt && assignment.endedAt > assignment.updatedAt) fail("endedAt", "End must precede its last update");
  if (assignment.startedAt && assignment.endedAt && assignment.endedAt < assignment.startedAt) fail("endedAt", "End must follow start");

  if (assignment.status === AssignmentStatus.PENDING && (assignment.startedAt || assignment.endedAt)) {
    fail("status", "Pending assignment has no effective period");
  }
  if (assignment.status === AssignmentStatus.ACTIVE && (!assignment.startedAt || assignment.endedAt)) {
    fail("status", "Active assignment requires an open effective period");
  }
  if (assignment.status === AssignmentStatus.REJECTED && (assignment.startedAt || !assignment.endedAt)) {
    fail("status", "Rejected assignment has a decision end without an effective start");
  }
  if ((assignment.status === AssignmentStatus.ENDED || assignment.status === AssignmentStatus.REVOKED)
    && (!assignment.startedAt || !assignment.endedAt)) {
    fail("status", "Closed assignment requires a complete effective period");
  }
});

export type CoachAthleteAssignment = z.infer<typeof coachAthleteAssignmentSchema>;
/** Input side, so the defaulted `reason` stays optional for callers that never set it. */
export type CreateCoachAthleteAssignmentInput = z.input<typeof identitySchema>;

export function createCoachAthleteAssignment(raw: CreateCoachAthleteAssignmentInput, now: Date): CoachAthleteAssignment {
  const identity = identitySchema.parse(raw);
  return coachAthleteAssignmentSchema.parse({
    ...identity,
    status: AssignmentStatus.PENDING,
    startedAt: null,
    endedAt: null,
    assignedBy: null,
    endedBy: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function transitionCoachAthleteAssignment(
  raw: CoachAthleteAssignment,
  status: AssignmentStatus,
  now: Date,
  actorId?: string,
): CoachAthleteAssignment {
  const assignment = coachAthleteAssignmentSchema.parse(raw);
  z.date().min(assignment.updatedAt).parse(now);
  const actor = actorId ? opaqueId.parse(actorId) : null;
  const allowed = assignment.status === AssignmentStatus.PENDING
    ? status === AssignmentStatus.ACTIVE || status === AssignmentStatus.REJECTED
    : assignment.status === AssignmentStatus.ACTIVE
      && (status === AssignmentStatus.ENDED || status === AssignmentStatus.REVOKED);
  if (!allowed) {
    throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION", "Transição de atribuição de professor inválida.", 409);
  }
  const isActivation = status === AssignmentStatus.ACTIVE;
  return coachAthleteAssignmentSchema.parse({
    ...assignment,
    status,
    startedAt: isActivation ? now : assignment.startedAt,
    endedAt: isActivation ? null : now,
    assignedBy: isActivation ? actor : assignment.assignedBy,
    endedBy: isActivation ? null : actor,
    updatedAt: now,
  });
}
