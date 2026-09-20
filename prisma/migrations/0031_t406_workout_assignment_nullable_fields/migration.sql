-- T406: Extend WorkoutAssignment for license-based (template) assignments
--
-- workoutId → nullable  (was: non-null required FK)
-- assignedBy → nullable (system-initiated assignments have no human assigner)
-- New columns: workoutTemplateId, matchStatus, matchedActivityId, matchedAt, matchScore, trainingLicenseId

ALTER TABLE "WorkoutAssignment" ALTER COLUMN "workoutId"  DROP NOT NULL;
ALTER TABLE "WorkoutAssignment" ALTER COLUMN "assignedBy" DROP NOT NULL;

ALTER TABLE "WorkoutAssignment"
    ADD COLUMN "workoutTemplateId"  TEXT,
    ADD COLUMN "matchStatus"        TEXT,
    ADD COLUMN "matchedActivityId"  TEXT,
    ADD COLUMN "matchedAt"          TIMESTAMPTZ(3),
    ADD COLUMN "matchScore"         DOUBLE PRECISION,
    ADD COLUMN "trainingLicenseId"  TEXT;

ALTER TABLE "WorkoutAssignment"
    ADD CONSTRAINT "WorkoutAssignment_matchStatus_check"
        CHECK ("matchStatus" IN ('PENDING','AUTO_MATCHED','CONFIRMED','OVERRIDDEN','NO_MATCH') OR "matchStatus" IS NULL);

CREATE INDEX "WorkoutAssignment_trainingLicenseId_idx" ON "WorkoutAssignment"("trainingLicenseId");

ALTER TABLE "WorkoutAssignment"
    ADD CONSTRAINT "WorkoutAssignment_workoutTemplateId_fkey"
        FOREIGN KEY ("workoutTemplateId") REFERENCES "WorkoutTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkoutAssignment"
    ADD CONSTRAINT "WorkoutAssignment_trainingLicenseId_fkey"
        FOREIGN KEY ("trainingLicenseId") REFERENCES "TrainingLicense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
