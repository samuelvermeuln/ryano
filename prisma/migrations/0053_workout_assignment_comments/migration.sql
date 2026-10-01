-- SAM-27 — athlete ↔ coach conversation on a prescription.
--
-- `WorkoutAssignmentComment`: free comments from either side (COMMENT) and the
-- athlete's request for the coach to evaluate the executed session
-- (REVIEW_REQUEST), resolved when the coach writes/updates a CoachEvaluation.
-- Append-only, like WorkoutAssignmentHistory. Purely additive: one enum, one
-- table. Rollback: drop the table, then the type.
CREATE TYPE "WorkoutAssignmentCommentKind" AS ENUM ('COMMENT', 'REVIEW_REQUEST');

CREATE TABLE "WorkoutAssignmentComment" (
  "id"                  TEXT NOT NULL,
  "workoutAssignmentId" TEXT NOT NULL,
  "authorUserId"        TEXT NOT NULL,
  "kind"                "WorkoutAssignmentCommentKind" NOT NULL DEFAULT 'COMMENT',
  "body"                VARCHAR(2000) NOT NULL,
  "resolvedAt"          TIMESTAMPTZ(3),
  "resolvedBy"          TEXT,
  "createdAt"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkoutAssignmentComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkoutAssignmentComment_workoutAssignmentId_createdAt_idx"
  ON "WorkoutAssignmentComment"("workoutAssignmentId", "createdAt");
CREATE INDEX "WorkoutAssignmentComment_kind_resolvedAt_idx"
  ON "WorkoutAssignmentComment"("kind", "resolvedAt");

ALTER TABLE "WorkoutAssignmentComment"
  ADD CONSTRAINT "WorkoutAssignmentComment_workoutAssignmentId_fkey"
  FOREIGN KEY ("workoutAssignmentId") REFERENCES "WorkoutAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignmentComment"
  ADD CONSTRAINT "WorkoutAssignmentComment_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignmentComment"
  ADD CONSTRAINT "WorkoutAssignmentComment_resolvedBy_fkey"
  FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
