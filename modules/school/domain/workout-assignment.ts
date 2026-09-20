import { z } from "zod";
import { WorkoutAssignmentStatus, WorkoutMatchStatus } from "./enums";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));
const nullableId = id.nullable();
const nullableDate = copiedDate.nullable();
const json = z.json();

export const workoutAssignmentSchema = z.strictObject({
  id,
  /** Null for template-based assignments created by the license system (T406). */
  workoutId: nullableId,
  /** Set for license-instantiated assignments; the template to resolve when the workout is created. */
  workoutTemplateId: nullableId,
  athleteId: id,
  /** Null for system-initiated assignments (e.g. license calendar instantiation). */
  assignedBy: nullableId,
  schoolId: nullableId,
  coachId: nullableId,
  teamId: nullableId,
  scheduledAt: nullableDate,
  dueAt: nullableDate,
  status: z.enum(WorkoutAssignmentStatus),
  matchStatus: z.enum(WorkoutMatchStatus).nullable(),
  matchedActivityId: nullableId,
  matchedAt: nullableDate,
  matchScore: z.number().min(0).max(100).nullable(),
  /** License that instantiated this assignment (T406). */
  trainingLicenseId: nullableId,
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((assignment, ctx) => {
  if (assignment.updatedAt < assignment.createdAt) {
    ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  }
  if (assignment.scheduledAt && assignment.dueAt && assignment.dueAt < assignment.scheduledAt) {
    ctx.addIssue({ code: "custom", path: ["dueAt"], message: "Due date cannot precede scheduled date" });
  }
  if (!assignment.workoutId && !assignment.workoutTemplateId) {
    ctx.addIssue({ code: "custom", path: ["workoutId"], message: "Either workoutId or workoutTemplateId is required" });
  }
});

export type WorkoutAssignment = z.infer<typeof workoutAssignmentSchema>;
export type CreateWorkoutAssignmentInput = Omit<WorkoutAssignment, "status" | "createdAt" | "updatedAt"> & { status?: WorkoutAssignmentStatus };

export function createWorkoutAssignment(raw: CreateWorkoutAssignmentInput, now: Date): WorkoutAssignment {
  return workoutAssignmentSchema.parse({ ...raw, status: raw.status ?? WorkoutAssignmentStatus.SCHEDULED, createdAt: now, updatedAt: now });
}

export const workoutAssignmentHistorySchema = z.strictObject({
  id,
  workoutAssignmentId: id,
  eventType: z.string().trim().min(1).max(100),
  actorUserId: id,
  payload: json,
  createdAt: copiedDate,
});

export type WorkoutAssignmentHistory = z.infer<typeof workoutAssignmentHistorySchema>;
export type CreateWorkoutAssignmentHistoryInput = Omit<WorkoutAssignmentHistory, "createdAt">;

export function createWorkoutAssignmentHistory(raw: CreateWorkoutAssignmentHistoryInput, now: Date): WorkoutAssignmentHistory {
  return workoutAssignmentHistorySchema.parse({ ...raw, createdAt: now });
}
