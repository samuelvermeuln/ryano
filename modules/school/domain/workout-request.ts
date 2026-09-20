import { z } from "zod";
import { WorkoutRequestStatus } from "./enums";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));

export const workoutRequestSchema = z.strictObject({
  id,
  athleteId: id,
  schoolId: id,
  sportType: z.string().trim().min(1).max(100),
  preferredDate: copiedDate.nullable(),
  note: z.string().trim().max(2000).nullable(),
  status: z.enum(WorkoutRequestStatus),
  decidedBy: id.nullable(),
  decidedAt: copiedDate.nullable(),
  declineReason: z.string().trim().max(2000).nullable(),
  resultingAssignmentId: id.nullable(),
  createdAt: copiedDate,
  updatedAt: copiedDate,
}).superRefine((request, ctx) => {
  if (request.updatedAt < request.createdAt) {
    ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  }

  const isDecided = request.status !== WorkoutRequestStatus.PENDING;
  if (!isDecided && (request.decidedBy !== null || request.decidedAt !== null)) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Pending request cannot have a decision" });
  }
  if (isDecided && (request.decidedBy === null || request.decidedAt === null)) {
    ctx.addIssue({ code: "custom", path: ["decidedAt"], message: "Decided request requires decider and decision date" });
  }

  if (request.status === WorkoutRequestStatus.APPROVED && !request.resultingAssignmentId) {
    ctx.addIssue({ code: "custom", path: ["resultingAssignmentId"], message: "Approved request must reference the resulting assignment" });
  }
  if (request.status !== WorkoutRequestStatus.APPROVED && request.resultingAssignmentId) {
    ctx.addIssue({ code: "custom", path: ["resultingAssignmentId"], message: "Only an approved request may reference an assignment" });
  }
});

export type WorkoutRequest = z.infer<typeof workoutRequestSchema>;

export type CreateWorkoutRequestInput = {
  id: string;
  athleteId: string;
  schoolId: string;
  sportType: string;
  preferredDate: Date | null;
  note: string | null;
};

export function createWorkoutRequest(raw: CreateWorkoutRequestInput, now: Date): WorkoutRequest {
  return workoutRequestSchema.parse({
    ...raw,
    status: WorkoutRequestStatus.PENDING,
    decidedBy: null,
    decidedAt: null,
    declineReason: null,
    resultingAssignmentId: null,
    createdAt: now,
    updatedAt: now,
  });
}
