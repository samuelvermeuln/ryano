-- SAM-74 — activity files imported by the athlete (§17.3, §18.3, §21.4, §20).
-- The bytes live in the database (as the avatar does): no public URL; the
-- download route reapplies the same authorization as the screens. A file is
-- kept while its activity exists and the athlete may delete it; the Activity
-- and Ryvano's revisions stay (§21.4).

ALTER TYPE "WearableProvider" ADD VALUE IF NOT EXISTS 'FILE';

CREATE TABLE "StoredFile" (
  "id"                  TEXT NOT NULL,
  "ownerUserId"         TEXT NOT NULL,
  "kind"                VARCHAR(30) NOT NULL,
  "activityId"          TEXT,
  "workoutAssignmentId" TEXT,
  "filename"            VARCHAR(200) NOT NULL,
  "contentType"         VARCHAR(100) NOT NULL,
  "sizeBytes"           INTEGER NOT NULL,
  "sha256"              VARCHAR(64) NOT NULL,
  "bytes"               BYTEA NOT NULL,
  "createdAt"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoredFile_kind_check" CHECK ("kind" IN ('ACTIVITY_FILE', 'FEEDBACK_ATTACHMENT')),
  CONSTRAINT "StoredFile_target_check" CHECK (
    ("kind" = 'ACTIVITY_FILE' AND "activityId" IS NOT NULL)
    OR ("kind" = 'FEEDBACK_ATTACHMENT' AND "workoutAssignmentId" IS NOT NULL)
  )
);
CREATE INDEX "StoredFile_ownerUserId_idx" ON "StoredFile"("ownerUserId");
CREATE INDEX "StoredFile_activityId_idx" ON "StoredFile"("activityId");
CREATE INDEX "StoredFile_workoutAssignmentId_idx" ON "StoredFile"("workoutAssignmentId");
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_workoutAssignmentId_fkey" FOREIGN KEY ("workoutAssignmentId") REFERENCES "WorkoutAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback (manual): DROP TABLE "StoredFile"; (the enum value cannot be removed).