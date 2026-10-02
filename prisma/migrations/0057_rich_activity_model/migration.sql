-- SAM-38 — rich activity model (ADR-005 / ADR-006). Additive only.
--
-- 1. `Activity` gains the extended, provider-agnostic stats the rich detail
--    needs (timer/elapsed time, calories split, strokes/SWOLF, temperature,
--    training load/effect with the provider's label, proprietary energy impact
--    with its label, route polyline and start/end coordinates, editorial title,
--    sub-sport), plus `duplicateOfActivityId` (the same session recorded by a
--    second connection — SAM-45) and `detailSyncedAt` (SAM-39). Every new column
--    is nullable: absence is never zero.
-- 2. `ActivityLap`, `ActivityZone` and `ActivityStream` hold laps, time-in-zone
--    per zone set and time series. Each row says which provider measured it and
--    whether the value is native or derived by Ryvano (`MetricSourceKind`).
--    Streams are stored one row per series with the samples as a JSON array
--    (columnar), not one row per sample (ADR-006).
-- 3. `AthleteFeedback` may now belong to an activity with no prescription
--    (`activityId`), so `workoutExecutionId`/`workoutAssignmentId` become
--    nullable with a CHECK that exactly one anchor exists.
--
-- Rollback: drop the three tables, the three enums, the new Activity columns
-- and the AthleteFeedback changes (see architecture/escola-migration-checklist.md).

-- 1. Activity --------------------------------------------------------------

ALTER TABLE "Activity"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "subSportType" TEXT,
  ADD COLUMN "timerSeconds" INTEGER,
  ADD COLUMN "elapsedSeconds" INTEGER,
  ADD COLUMN "caloriesActive" INTEGER,
  ADD COLUMN "caloriesResting" INTEGER,
  ADD COLUMN "estimatedSweatLossMl" INTEGER,
  ADD COLUMN "totalStrokes" INTEGER,
  ADD COLUMN "averageStrokeRate" DOUBLE PRECISION,
  ADD COLUMN "maxStrokeRate" DOUBLE PRECISION,
  ADD COLUMN "averageDistancePerStroke" DOUBLE PRECISION,
  ADD COLUMN "averageSwolf" DOUBLE PRECISION,
  ADD COLUMN "averageTemperature" DOUBLE PRECISION,
  ADD COLUMN "minTemperature" DOUBLE PRECISION,
  ADD COLUMN "maxTemperature" DOUBLE PRECISION,
  ADD COLUMN "trainingLoad" DOUBLE PRECISION,
  ADD COLUMN "aerobicEffect" DOUBLE PRECISION,
  ADD COLUMN "aerobicEffectLabel" TEXT,
  ADD COLUMN "anaerobicEffect" DOUBLE PRECISION,
  ADD COLUMN "anaerobicEffectLabel" TEXT,
  ADD COLUMN "energyImpact" DOUBLE PRECISION,
  ADD COLUMN "energyLabel" TEXT,
  ADD COLUMN "routePolyline" TEXT,
  ADD COLUMN "startLatitude" DOUBLE PRECISION,
  ADD COLUMN "startLongitude" DOUBLE PRECISION,
  ADD COLUMN "endLatitude" DOUBLE PRECISION,
  ADD COLUMN "endLongitude" DOUBLE PRECISION,
  ADD COLUMN "duplicateOfActivityId" TEXT,
  ADD COLUMN "detailSyncedAt" TIMESTAMP(3);

ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_duplicateOfActivityId_fkey"
  FOREIGN KEY ("duplicateOfActivityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Activity_duplicateOfActivityId_idx" ON "Activity"("duplicateOfActivityId");

-- 2. Enums + detail tables --------------------------------------------------

CREATE TYPE "MetricSourceKind" AS ENUM ('NATIVE', 'DERIVED');
CREATE TYPE "ActivityZoneType" AS ENUM ('HEART_RATE', 'POWER', 'PACE');
CREATE TYPE "ActivityStreamKey" AS ENUM (
  'TIME', 'DISTANCE', 'LATLNG', 'ALTITUDE', 'HEART_RATE', 'CADENCE', 'STROKE_RATE', 'POWER', 'SPEED', 'TEMPERATURE'
);

CREATE TABLE "ActivityLap" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "lapNumber" INTEGER NOT NULL,
  "sourceProvider" "WearableProvider" NOT NULL,
  "sourceKind" "MetricSourceKind" NOT NULL DEFAULT 'NATIVE',
  "startedAt" TIMESTAMP(3),
  "durationSeconds" INTEGER,
  "movingSeconds" INTEGER,
  "distanceMeters" DOUBLE PRECISION,
  "averagePace" DOUBLE PRECISION,
  "averageSpeed" DOUBLE PRECISION,
  "averageHeartRate" INTEGER,
  "maxHeartRate" INTEGER,
  "averageCadence" DOUBLE PRECISION,
  "averageStrokeRate" DOUBLE PRECISION,
  "maxStrokeRate" DOUBLE PRECISION,
  "averageDistancePerStroke" DOUBLE PRECISION,
  "averagePower" DOUBLE PRECISION,
  "calories" INTEGER,
  "averageTemperature" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActivityLap_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivityLap_activityId_lapNumber_key" ON "ActivityLap"("activityId", "lapNumber");
ALTER TABLE "ActivityLap"
  ADD CONSTRAINT "ActivityLap_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ActivityZone" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "zoneType" "ActivityZoneType" NOT NULL,
  "zoneNumber" INTEGER NOT NULL,
  "label" TEXT,
  "lowerBound" DOUBLE PRECISION,
  "upperBound" DOUBLE PRECISION,
  "durationSeconds" INTEGER NOT NULL,
  "sourceProvider" "WearableProvider" NOT NULL,
  "sourceKind" "MetricSourceKind" NOT NULL DEFAULT 'NATIVE',
  "configurationRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityZone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivityZone_activityId_zoneType_zoneNumber_key" ON "ActivityZone"("activityId", "zoneType", "zoneNumber");
ALTER TABLE "ActivityZone"
  ADD CONSTRAINT "ActivityZone_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ActivityStream" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "key" "ActivityStreamKey" NOT NULL,
  "sourceProvider" "WearableProvider" NOT NULL,
  "sourceKind" "MetricSourceKind" NOT NULL DEFAULT 'NATIVE',
  "sampleCount" INTEGER NOT NULL,
  "values" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActivityStream_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivityStream_activityId_key_key" ON "ActivityStream"("activityId", "key");
ALTER TABLE "ActivityStream"
  ADD CONSTRAINT "ActivityStream_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. AthleteFeedback: anchored to an execution OR to an activity ------------

ALTER TABLE "AthleteFeedback"
  ALTER COLUMN "workoutExecutionId" DROP NOT NULL,
  ALTER COLUMN "workoutAssignmentId" DROP NOT NULL,
  ADD COLUMN "activityId" TEXT;

CREATE UNIQUE INDEX "AthleteFeedback_activityId_key" ON "AthleteFeedback"("activityId");

ALTER TABLE "AthleteFeedback"
  ADD CONSTRAINT "AthleteFeedback_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AthleteFeedback"
  ADD CONSTRAINT "AthleteFeedback_anchor_check"
  CHECK (("workoutExecutionId" IS NOT NULL) <> ("activityId" IS NOT NULL));

-- Rollback (manual):
--   ALTER TABLE "AthleteFeedback" DROP CONSTRAINT "AthleteFeedback_anchor_check";
--   ALTER TABLE "AthleteFeedback" DROP CONSTRAINT "AthleteFeedback_activityId_fkey";
--   DROP INDEX "AthleteFeedback_activityId_key";
--   ALTER TABLE "AthleteFeedback" DROP COLUMN "activityId",
--     ALTER COLUMN "workoutExecutionId" SET NOT NULL, ALTER COLUMN "workoutAssignmentId" SET NOT NULL;
--   DROP TABLE "ActivityStream"; DROP TABLE "ActivityZone"; DROP TABLE "ActivityLap";
--   DROP TYPE "ActivityStreamKey"; DROP TYPE "ActivityZoneType"; DROP TYPE "MetricSourceKind";
--   ALTER TABLE "Activity" DROP CONSTRAINT "Activity_duplicateOfActivityId_fkey";
--   DROP INDEX "Activity_duplicateOfActivityId_idx";
--   ALTER TABLE "Activity" DROP COLUMN "title", ... (every column added in step 1).
