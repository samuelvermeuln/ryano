-- SAM-61 — session feedback (completion, difficulty, adaptation/interruption
-- reason, pain, attachment, RPE only when requested) that does not need a
-- matched execution, and the configurable sync window. Additive.

ALTER TABLE "AthleteFeedback" ALTER COLUMN "rpe" DROP NOT NULL;
ALTER TABLE "AthleteFeedback" ADD COLUMN "completion" VARCHAR(20);
ALTER TABLE "AthleteFeedback" ADD COLUMN "rpeScale" VARCHAR(20);
ALTER TABLE "AthleteFeedback" ADD COLUMN "rpeCollectedAt" TIMESTAMPTZ(3);
ALTER TABLE "AthleteFeedback" ADD COLUMN "difficulty" INTEGER;
ALTER TABLE "AthleteFeedback" ADD COLUMN "adaptationReason" VARCHAR(40);
ALTER TABLE "AthleteFeedback" ADD COLUMN "adaptationNote" VARCHAR(1000);
ALTER TABLE "AthleteFeedback" ADD COLUMN "painReported" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AthleteFeedback" ADD COLUMN "painNote" VARCHAR(1000);
ALTER TABLE "AthleteFeedback" ADD COLUMN "attachmentUrl" VARCHAR(500);

ALTER TABLE "AthleteFeedback" ADD CONSTRAINT "AthleteFeedback_completion_check" CHECK ("completion" IS NULL OR "completion" IN ('FULL','PARTIAL','NOT_DONE'));
ALTER TABLE "AthleteFeedback" ADD CONSTRAINT "AthleteFeedback_difficulty_check" CHECK ("difficulty" IS NULL OR "difficulty" BETWEEN 1 AND 5);
ALTER TABLE "AthleteFeedback" ADD CONSTRAINT "AthleteFeedback_rpe_check" CHECK ("rpe" IS NULL OR "rpe" BETWEEN 1 AND 10);

-- Anchor: a matched execution, an imported activity, or (new) the prescription
-- itself when there is no execution ("não realizei", manual without watch).
ALTER TABLE "AthleteFeedback" DROP CONSTRAINT "AthleteFeedback_anchor_check";
ALTER TABLE "AthleteFeedback" ADD CONSTRAINT "AthleteFeedback_anchor_check" CHECK (
  ("activityId" IS NOT NULL AND "workoutExecutionId" IS NULL AND "workoutAssignmentId" IS NULL)
  OR ("activityId" IS NULL AND "workoutAssignmentId" IS NOT NULL)
);
-- One feedback per prescription when it is not tied to an execution.
CREATE UNIQUE INDEX "AthleteFeedback_assignment_without_execution_key" ON "AthleteFeedback"("workoutAssignmentId") WHERE "workoutExecutionId" IS NULL;

-- §6.1 — how long after the scheduled time a session reads "aguardando registro" instead of "sem registro".
ALTER TABLE "FollowUpPolicy" ADD COLUMN "syncWindowHours" INTEGER NOT NULL DEFAULT 48;

-- Rollback (manual):
-- ALTER TABLE "FollowUpPolicy" DROP COLUMN "syncWindowHours";
-- DROP INDEX "AthleteFeedback_assignment_without_execution_key";
-- ALTER TABLE "AthleteFeedback" DROP CONSTRAINT "AthleteFeedback_anchor_check";
-- DELETE FROM "AthleteFeedback" WHERE "workoutExecutionId" IS NULL AND "activityId" IS NULL;
-- ALTER TABLE "AthleteFeedback" ADD CONSTRAINT "AthleteFeedback_anchor_check" CHECK (("workoutExecutionId" IS NOT NULL) <> ("activityId" IS NOT NULL));
-- ALTER TABLE "AthleteFeedback" DROP CONSTRAINT "AthleteFeedback_rpe_check", DROP CONSTRAINT "AthleteFeedback_difficulty_check", DROP CONSTRAINT "AthleteFeedback_completion_check",
--   DROP COLUMN "attachmentUrl", DROP COLUMN "painNote", DROP COLUMN "painReported", DROP COLUMN "adaptationNote", DROP COLUMN "adaptationReason",
--   DROP COLUMN "difficulty", DROP COLUMN "rpeCollectedAt", DROP COLUMN "rpeScale", DROP COLUMN "completion";
-- UPDATE "AthleteFeedback" SET "rpe" = 5 WHERE "rpe" IS NULL; ALTER TABLE "AthleteFeedback" ALTER COLUMN "rpe" SET NOT NULL;
