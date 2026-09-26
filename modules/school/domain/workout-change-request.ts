import { z } from "zod";
import { WorkoutChangeRequestStatus } from "./enums";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));

const OPEN_STATUSES: WorkoutChangeRequestStatus[] = [
  WorkoutChangeRequestStatus.PENDING,
  WorkoutChangeRequestStatus.ACKNOWLEDGED,
];

/**
 * A school administrator asks the coach who issued a prescription to revise it
 * after the fact — a wrong distance, a session logged against the wrong athlete,
 * a target that no longer reflects what was agreed.
 *
 * The request is a conversation record, not a mutation: it never edits the
 * WorkoutAssignment. Only the coach can act on the prescription itself, which
 * keeps authorship intact (`ownership, authorship and access are separate`).
 */
export const workoutChangeRequestSchema = z.strictObject({
  id,
  schoolId: id,
  workoutAssignmentId: id,
  /** Coach responsible for the prescription; the person expected to act. */
  coachId: id,
  /** Administrator who opened the request. */
  requestedBy: id,
  reason: z.string().trim().min(1).max(2000),
  status: z.enum(WorkoutChangeRequestStatus),
  resolvedBy: id.nullable(),
  resolvedAt: copiedDate.nullable(),
  resolutionNote: z.string().trim().max(2000).nullable(),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((request, ctx) => {
  if (request.updatedAt < request.createdAt) {
    ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  }

  const isOpen = OPEN_STATUSES.includes(request.status);
  if (isOpen && (request.resolvedBy !== null || request.resolvedAt !== null)) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Open request cannot carry a resolution" });
  }
  if (!isOpen && (request.resolvedBy === null || request.resolvedAt === null)) {
    ctx.addIssue({ code: "custom", path: ["resolvedAt"], message: "Closed request requires resolver and resolution date" });
  }
  if (request.resolvedAt !== null && request.resolvedAt < request.createdAt) {
    ctx.addIssue({ code: "custom", path: ["resolvedAt"], message: "Resolution cannot precede creation" });
  }
});

export type WorkoutChangeRequest = z.infer<typeof workoutChangeRequestSchema>;

export type CreateWorkoutChangeRequestInput = {
  id: string;
  schoolId: string;
  workoutAssignmentId: string;
  coachId: string;
  requestedBy: string;
  reason: string;
};

export function createWorkoutChangeRequest(
  raw: CreateWorkoutChangeRequestInput,
  now: Date,
): WorkoutChangeRequest {
  return workoutChangeRequestSchema.parse({
    ...raw,
    status: WorkoutChangeRequestStatus.PENDING,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: now,
    updatedAt: now,
  });
}

/** Terminal states never transition again, so a decided request is immutable. */
export function transitionWorkoutChangeRequest(
  current: WorkoutChangeRequest,
  next: WorkoutChangeRequestStatus,
  actorUserId: string,
  now: Date,
  resolutionNote: string | null = null,
): WorkoutChangeRequest {
  if (!OPEN_STATUSES.includes(current.status)) {
    throw new Error("WORKOUT_CHANGE_REQUEST_NOT_OPEN");
  }
  if (next === WorkoutChangeRequestStatus.PENDING) {
    throw new Error("WORKOUT_CHANGE_REQUEST_INVALID_TRANSITION");
  }
  const closes = !OPEN_STATUSES.includes(next);
  return workoutChangeRequestSchema.parse({
    ...current,
    status: next,
    resolvedBy: closes ? actorUserId : null,
    resolvedAt: closes ? now : null,
    resolutionNote: closes ? resolutionNote : null,
    updatedAt: now,
  });
}
