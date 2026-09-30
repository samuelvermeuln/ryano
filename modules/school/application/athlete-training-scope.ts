/**
 * Shared vocabulary for reading one athlete's prescribed training.
 *
 * Extracted from `GetSchoolAthleteTraining` so the coach-facing screens
 * (`/professor/[schoolId]/atletas/[athleteId]/**`) and the school's
 * administration sheet resolve "overdue", "done" and "closed without
 * execution" from a single place. Two copies of this boundary is how the
 * dashboard count and the athlete screen end up disagreeing about the same row.
 *
 * Pure: no I/O, no Prisma client — only `Prisma.*WhereInput` shapes.
 */
import type { Prisma } from "@prisma/client";
import { WorkoutAssignmentStatus, WorkoutChangeRequestStatus, WorkoutMatchStatus } from "../domain/enums";

export const ATHLETE_TRAINING_FILTERS = ["todos", "proximos", "atrasados", "realizados", "sem-execucao"] as const;
export type AthleteTrainingFilter = (typeof ATHLETE_TRAINING_FILTERS)[number];

export const ATHLETE_TRAINING_DEFAULT_LIMIT = 30;
export const ATHLETE_TRAINING_MAX_LIMIT = 200;

/** Prescribed and not yet executed — the only states that can fall overdue. */
export const OPEN_ASSIGNMENT_STATUSES = [
  WorkoutAssignmentStatus.SCHEDULED,
  WorkoutAssignmentStatus.AVAILABLE,
];
export const DONE_ASSIGNMENT_STATUSES = [
  WorkoutAssignmentStatus.COMPLETED,
  WorkoutAssignmentStatus.PARTIALLY_COMPLETED,
];
/** Closed without the athlete executing it: missed, cancelled, moved or excused. */
export const CLOSED_WITHOUT_EXECUTION_STATUSES = [
  WorkoutAssignmentStatus.MISSED,
  WorkoutAssignmentStatus.CANCELLED,
  WorkoutAssignmentStatus.RESCHEDULED,
  WorkoutAssignmentStatus.JUSTIFIED,
];
export const OPEN_CHANGE_REQUEST_STATUSES = [
  WorkoutChangeRequestStatus.PENDING,
  WorkoutChangeRequestStatus.ACKNOWLEDGED,
];
/** Executions that really belong to the prescription, as every other screen reads them. */
export const MATCHED_EXECUTION_STATUSES = [
  WorkoutMatchStatus.AUTO_MATCHED,
  WorkoutMatchStatus.CONFIRMED,
  WorkoutMatchStatus.OVERRIDDEN,
];

export function startOfUtcDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

/**
 * The "overdue" boundary is before today in UTC — the same one the school
 * dashboard ranking uses, so the number on an athlete screen and the number on
 * a dashboard never contradict each other.
 */
export function assignmentFilterWhere(
  filter: AthleteTrainingFilter,
  today: Date,
): Prisma.WorkoutAssignmentWhereInput {
  switch (filter) {
    case "proximos":
      return {
        status: { in: OPEN_ASSIGNMENT_STATUSES },
        OR: [{ scheduledAt: null }, { scheduledAt: { gte: today } }],
      };
    case "atrasados":
      return { status: { in: OPEN_ASSIGNMENT_STATUSES }, scheduledAt: { lt: today } };
    case "realizados":
      return { status: { in: DONE_ASSIGNMENT_STATUSES } };
    case "sem-execucao":
      return { status: { in: CLOSED_WITHOUT_EXECUTION_STATUSES } };
    default:
      return {};
  }
}

/** Decided on the server so no client ever needs the current time to render a badge. */
export function isAssignmentOverdue(
  assignment: { scheduledAt: Date | null; status: string },
  today: Date,
): boolean {
  return (
    assignment.scheduledAt !== null
    && assignment.scheduledAt < today
    && (OPEN_ASSIGNMENT_STATUSES as readonly string[]).includes(assignment.status)
  );
}
