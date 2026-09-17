import { z } from "zod";
import { WorkoutAssignmentStatus } from "./enums";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));
const nullableId = id.nullable();
const nullableDate = copiedDate.nullable();
const json = z.json();

export const workoutAssignmentSchema = z.strictObject({
  id,
  workoutId: id,
  athleteId: id,
  assignedBy: id,
  schoolId: nullableId,
  coachId: nullableId,
  teamId: nullableId,
  scheduledAt: nullableDate,
  dueAt: nullableDate,
  status: z.enum(WorkoutAssignmentStatus),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((assignment, ctx) => {
  if (assignment.updatedAt < assignment.createdAt) {
    ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  }
  if (assignment.scheduledAt && assignment.dueAt && assignment.dueAt < assignment.scheduledAt) {
    ctx.addIssue({ code: "custom", path: ["dueAt"], message: "Due date cannot precede scheduled date" });
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
