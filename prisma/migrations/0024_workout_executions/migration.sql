-- T162: Records the execution of a prescribed workout matched to a provider activity.
-- matchStatus drives the reconciliation lifecycle:
--   PENDING      — activity ingested, matching in progress
--   AUTO_MATCHED — system found a confident match (score ≥ threshold)
--   CONFIRMED    — athlete or coach confirmed the auto-match
--   OVERRIDDEN   — user chose a different activity than the auto-match
--   NO_MATCH     — no suitable match found after scoring

CREATE TYPE "WorkoutMatchStatus" AS ENUM (
    'PENDING',
    'AUTO_MATCHED',
    'CONFIRMED',
    'OVERRIDDEN',
    'NO_MATCH'
);

CREATE TABLE "WorkoutExecution" (
    "id" TEXT NOT NULL,
    "workoutAssignmentId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "externalId" VARCHAR(256) NOT NULL,
    "sportType" VARCHAR(100) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "durationSeconds" INTEGER,
    "movingSeconds" INTEGER,
    "distanceMeters" DOUBLE PRECISION,
    "averageHeartRate" INTEGER,
    "maxHeartRate" INTEGER,
    "averageSpeed" DOUBLE PRECISION,
    "elevationGain" DOUBLE PRECISION,
    "averagePower" INTEGER,
    "matchScore" INTEGER NOT NULL,
    "matchStatus" "WorkoutMatchStatus" NOT NULL DEFAULT 'PENDING',
    "activityPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WorkoutExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkoutExecution_workoutAssignmentId_source_externalId_key"
    ON "WorkoutExecution"("workoutAssignmentId", "source", "externalId");
CREATE INDEX "WorkoutExecution_athleteId_startedAt_idx"
    ON "WorkoutExecution"("athleteId", "startedAt");
CREATE INDEX "WorkoutExecution_workoutAssignmentId_matchStatus_idx"
    ON "WorkoutExecution"("workoutAssignmentId", "matchStatus");

ALTER TABLE "WorkoutExecution" ADD CONSTRAINT "WorkoutExecution_workoutAssignmentId_fkey"
    FOREIGN KEY ("workoutAssignmentId") REFERENCES "WorkoutAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutExecution" ADD CONSTRAINT "WorkoutExecution_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
