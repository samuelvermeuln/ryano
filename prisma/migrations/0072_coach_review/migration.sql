-- SAM-64 — the coach's review (§6 step 12, §19.2, §21.1 Review, AC24):
-- technical observation, decision, justification, next review and links to
-- the future changes made from it. "Realizado" and "revisado" are distinct;
-- saving a review never changes a prescription.

ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'REVIEW_DUE';

CREATE TABLE "CoachReview" (
  "id"                  TEXT NOT NULL,
  "targetType"          VARCHAR(20) NOT NULL,
  "workoutAssignmentId" TEXT,
  "eventPreparationId"  TEXT,
  "athleteId"           TEXT NOT NULL,
  "coachId"             TEXT NOT NULL,
  "schoolId"            TEXT,
  "authorUserId"        TEXT NOT NULL,
  "observation"         VARCHAR(5000) NOT NULL,
  "decision"            VARCHAR(30) NOT NULL,
  "justification"       VARCHAR(2000),
  "nextReviewLocalDate" VARCHAR(10),
  "linkedAssignmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isVisible"           BOOLEAN NOT NULL DEFAULT true,
  "version"             INTEGER NOT NULL DEFAULT 1,
  "createdAt"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CoachReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachReview_targetType_check" CHECK ("targetType" IN ('ASSIGNMENT', 'PREPARATION')),
  CONSTRAINT "CoachReview_target_check" CHECK (
    ("targetType" = 'ASSIGNMENT' AND "workoutAssignmentId" IS NOT NULL AND "eventPreparationId" IS NULL)
    OR ("targetType" = 'PREPARATION' AND "eventPreparationId" IS NOT NULL AND "workoutAssignmentId" IS NULL)
  ),
  CONSTRAINT "CoachReview_decision_check" CHECK ("decision" IN ('KEEP', 'ADAPT_FUTURE', 'RENEGOTIATE_GOAL', 'MILESTONE_DECISION', 'NONE')),
  CONSTRAINT "CoachReview_nextReviewLocalDate_check" CHECK ("nextReviewLocalDate" IS NULL OR "nextReviewLocalDate" ~ '^\d{4}-\d{2}-\d{2}$')
);

-- One current review per prescription (editing creates a revision); a preparation is reviewed over time.
CREATE UNIQUE INDEX "CoachReview_workoutAssignmentId_key" ON "CoachReview"("workoutAssignmentId") WHERE "workoutAssignmentId" IS NOT NULL;
CREATE INDEX "CoachReview_eventPreparationId_createdAt_idx" ON "CoachReview"("eventPreparationId", "createdAt");
CREATE INDEX "CoachReview_athleteId_createdAt_idx" ON "CoachReview"("athleteId", "createdAt");

ALTER TABLE "CoachReview" ADD CONSTRAINT "CoachReview_workoutAssignmentId_fkey" FOREIGN KEY ("workoutAssignmentId") REFERENCES "WorkoutAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachReview" ADD CONSTRAINT "CoachReview_eventPreparationId_fkey" FOREIGN KEY ("eventPreparationId") REFERENCES "EventPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachReview" ADD CONSTRAINT "CoachReview_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachReview" ADD CONSTRAINT "CoachReview_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachReview" ADD CONSTRAINT "CoachReview_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Editing keeps the authorship: every previous content stays as a revision.
CREATE TABLE "CoachReviewRevision" (
  "id"             TEXT NOT NULL,
  "reviewId"       TEXT NOT NULL,
  "version"        INTEGER NOT NULL,
  "snapshot"       JSONB NOT NULL,
  "editedByUserId" TEXT NOT NULL,
  "createdAt"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachReviewRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoachReviewRevision_reviewId_version_key" ON "CoachReviewRevision"("reviewId", "version");
ALTER TABLE "CoachReviewRevision" ADD CONSTRAINT "CoachReviewRevision_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "CoachReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachReviewRevision" ADD CONSTRAINT "CoachReviewRevision_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback (manual; the enum value stays, PostgreSQL does not drop enum values):
-- DROP TABLE "CoachReviewRevision";
-- DROP TABLE "CoachReview";