import { z } from "zod";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const copiedDate = z.date().transform((value) => new Date(value));

/** SAM-27 — free text from either side, or the athlete asking for an evaluation. */
export const WorkoutAssignmentCommentKind = {
  COMMENT: "COMMENT",
  REVIEW_REQUEST: "REVIEW_REQUEST",
} as const;
export type WorkoutAssignmentCommentKind = (typeof WorkoutAssignmentCommentKind)[keyof typeof WorkoutAssignmentCommentKind];

export const workoutAssignmentCommentBodySchema = z.string().trim().min(1).max(2000);

export const workoutAssignmentCommentSchema = z.strictObject({
  id,
  workoutAssignmentId: id,
  authorUserId: id,
  kind: z.enum(WorkoutAssignmentCommentKind),
  body: workoutAssignmentCommentBodySchema,
  resolvedAt: copiedDate.nullable(),
  resolvedBy: id.nullable(),
  createdAt: copiedDate,
}).superRefine((comment, ctx) => {
  if ((comment.resolvedAt === null) !== (comment.resolvedBy === null)) {
    ctx.addIssue({ code: "custom", path: ["resolvedBy"], message: "Resolution requires both the moment and its author" });
  }
  if (comment.resolvedAt && comment.kind !== WorkoutAssignmentCommentKind.REVIEW_REQUEST) {
    ctx.addIssue({ code: "custom", path: ["resolvedAt"], message: "Only a review request is resolved" });
  }
  if (comment.resolvedAt && comment.resolvedAt < comment.createdAt) {
    ctx.addIssue({ code: "custom", path: ["resolvedAt"], message: "Resolution cannot precede the request" });
  }
});

export type WorkoutAssignmentComment = z.infer<typeof workoutAssignmentCommentSchema>;

export function createWorkoutAssignmentComment(
  raw: { id: string; workoutAssignmentId: string; authorUserId: string; kind: WorkoutAssignmentCommentKind; body: string },
  now: Date,
): WorkoutAssignmentComment {
  return workoutAssignmentCommentSchema.parse({ ...raw, resolvedAt: null, resolvedBy: null, createdAt: now });
}
