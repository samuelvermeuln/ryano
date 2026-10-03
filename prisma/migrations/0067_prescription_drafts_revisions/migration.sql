-- SAM-59 — prescription drafts (coach-only), version chain of prescribed
-- workouts (superseded/amendment) and optimistic concurrency of revisions. Additive.

ALTER TABLE "Workout" ADD COLUMN "supersedesWorkoutId" TEXT;
ALTER TABLE "Workout" ADD COLUMN "amendment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workout" ADD COLUMN "revisionReason" VARCHAR(500);
ALTER TABLE "Workout" ADD COLUMN "revisedByUserId" TEXT;
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_supersedesWorkoutId_fkey" FOREIGN KEY ("supersedesWorkoutId") REFERENCES "Workout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Workout_supersedesWorkoutId_idx" ON "Workout"("supersedesWorkoutId");

ALTER TABLE "WorkoutAssignment" ADD COLUMN "prescriptionVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WorkoutAssignment" ADD COLUMN "amendmentWorkoutId" TEXT;

CREATE TABLE "PrescriptionDraft" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "schoolId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "scheduledAtLocal" VARCHAR(20),
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PrescriptionDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrescriptionDraft_coachId_athleteId_idx" ON "PrescriptionDraft"("coachId", "athleteId");
ALTER TABLE "PrescriptionDraft" ADD CONSTRAINT "PrescriptionDraft_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrescriptionDraft" ADD CONSTRAINT "PrescriptionDraft_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrescriptionDraft" ADD CONSTRAINT "PrescriptionDraft_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback (manual):
-- DROP TABLE "PrescriptionDraft";
-- ALTER TABLE "WorkoutAssignment" DROP COLUMN "amendmentWorkoutId", DROP COLUMN "prescriptionVersion";
-- DROP INDEX "Workout_supersedesWorkoutId_idx"; ALTER TABLE "Workout" DROP CONSTRAINT "Workout_supersedesWorkoutId_fkey",
--   DROP COLUMN "revisedByUserId", DROP COLUMN "revisionReason", DROP COLUMN "amendment", DROP COLUMN "supersedesWorkoutId";
