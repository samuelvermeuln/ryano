import { z } from "zod";
import { RYVANO_SPORT_TYPES } from "@/modules/shared/activities/sport-types";
import { SchoolError } from "@/modules/school/domain/errors";
import { AssignmentStatus } from "./enums";

const id = z.string().min(1).refine((value) => value.trim() === value);
const date = z.date().transform((value) => new Date(value));
const identity = z.strictObject({
  id,
  athleteId: id,
  coachId: id,
  schoolId: id.nullable(),
  isPrimary: z.boolean(),
  sportType: z.enum(RYVANO_SPORT_TYPES).nullable(),
  assignedBy: id.nullable(),
});
const creation = identity.extend({
  schoolId: identity.shape.schoolId.default(null),
  isPrimary: identity.shape.isPrimary.default(true),
  sportType: identity.shape.sportType.default(null),
  assignedBy: identity.shape.assignedBy.default(null),
});

/** A period references User.id and CoachProfile.id; ending it preserves history. */
export const coachAthleteAssignmentSchema = identity.extend({
  status: z.enum(AssignmentStatus),
  startedAt: date.nullable(),
  endedAt: date.nullable(),
  endedBy: id.nullable(),
  createdAt: date,
  updatedAt: date,
}).superRefine((value, ctx) => {
  const fail = (path: string) => ctx.addIssue({ code: "custom", path: [path], message: "Inconsistent temporal coach assignment" });
  if (value.updatedAt < value.createdAt) fail("updatedAt");
  if (value.startedAt && (value.startedAt < value.createdAt || value.startedAt > value.updatedAt)) fail("startedAt");
  if (value.endedAt && (value.endedAt < (value.startedAt ?? value.createdAt) || value.endedAt > value.updatedAt)) fail("endedAt");

  if (value.status === AssignmentStatus.PENDING || value.status === AssignmentStatus.REJECTED) {
    if (value.startedAt !== null) fail("startedAt");
  } else if (value.startedAt === null) fail("startedAt");

  if (value.status === AssignmentStatus.PENDING || value.status === AssignmentStatus.ACTIVE) {
    if (value.endedAt !== null) fail("endedAt");
    if (value.endedBy !== null) fail("endedBy");
  } else if (value.endedAt === null) fail("endedAt");
});

export type CoachAthleteAssignment = z.infer<typeof coachAthleteAssignmentSchema>;
export type CreateCoachAthleteAssignmentInput = z.input<typeof creation>;

export function createCoachAthleteAssignment(raw: CreateCoachAthleteAssignmentInput, now: Date): CoachAthleteAssignment {
  return coachAthleteAssignmentSchema.parse({
    ...creation.parse(raw),
    status: AssignmentStatus.PENDING,
    startedAt: null,
    endedAt: null,
    endedBy: null,
    createdAt: now,
    updatedAt: now,
  });
}

/** Pure transition; authorization and primary uniqueness belong to use cases/persistence. */
export function transitionCoachAthleteAssignment(
  raw: CoachAthleteAssignment,
  status: AssignmentStatus,
  now: Date,
  actorId?: string,
): CoachAthleteAssignment {
  const assignment = coachAthleteAssignmentSchema.parse(raw);
  z.date().min(assignment.updatedAt).parse(now);
  const allowed = assignment.status === AssignmentStatus.PENDING
    ? status === AssignmentStatus.ACTIVE || status === AssignmentStatus.REJECTED
    : assignment.status === AssignmentStatus.ACTIVE
      && (status === AssignmentStatus.ENDED || status === AssignmentStatus.REVOKED);
  if (!allowed) {
    throw new SchoolError("COACH_ATHLETE_ASSIGNMENT_INVALID_TRANSITION", "Transição de vínculo entre professor e atleta inválida.", 409);
  }
  const actor = actorId === undefined ? null : id.parse(actorId);
  return coachAthleteAssignmentSchema.parse({
    ...assignment,
    status,
    updatedAt: now,
    startedAt: status === AssignmentStatus.ACTIVE ? now : assignment.startedAt,
    endedAt: status === AssignmentStatus.ACTIVE ? null : now,
    assignedBy: assignment.assignedBy,
    endedBy: status === AssignmentStatus.ACTIVE ? null : actor,
  });
}
