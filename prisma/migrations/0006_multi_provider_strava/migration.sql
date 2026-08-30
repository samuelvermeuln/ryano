-- Migration 0006_multi_provider_strava
--
-- Additive, backward-compatible migration that prepares the schema for the
-- modular multi-provider integrations architecture (Strava alongside Garmin).
--
-- Scope (tasks 3, 3.1, 3.2, 3.3):
--   1. Add STRAVA to the WearableProvider enum.
--   2. Add STRAVA_ACCESS_TOKEN / STRAVA_REFRESH_TOKEN to the SecretType enum.
--   3. Add generic connection health columns to WearableConnection
--      (lastEventAt, lastSuccessAt, lastErrorAt).
--   4. Add Activity.providerSportType (raw provider sport type, preserved).
--   5. Create Strava-specific tables (connection details, webhook subscription,
--      webhook events, activity cache).
--   6. Data migration: canonicalize Activity.sportType while preserving the
--      original raw value in Activity.providerSportType.
--
-- All existing Activity rows are Garmin-only today, so the sportType data
-- migration below maps the raw Garmin typeKey strings onto the canonical
-- RyvanoSportType taxonomy in SQL (mirroring parseGarminSportType semantics).
--
-- Postgres note (ALTER TYPE ... ADD VALUE): on PostgreSQL 12+ enum values can be
-- added inside a transaction, but a newly added value cannot be *used* in the
-- same transaction. This migration only adds values here; the new enum values
-- are not referenced by any statement in this same migration (the sportType data
-- step operates on the plain TEXT column Activity.sportType, not on an enum), so
-- the operation is safe.

-- AlterEnum
ALTER TYPE "WearableProvider" ADD VALUE 'STRAVA' AFTER 'GARMIN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
ALTER TYPE "SecretType" ADD VALUE 'STRAVA_ACCESS_TOKEN';
ALTER TYPE "SecretType" ADD VALUE 'STRAVA_REFRESH_TOKEN';

-- AlterTable
ALTER TABLE "WearableConnection"
ADD COLUMN "lastEventAt" TIMESTAMP(3),
ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
ADD COLUMN "lastErrorAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "providerSportType" TEXT;

-- CreateTable
CREATE TABLE "StravaConnectionDetails" (
    "id" TEXT NOT NULL,
    "wearableConnectionId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "scopes" TEXT[],
    "accessTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StravaConnectionDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StravaWebhookSubscription" (
    "id" TEXT NOT NULL,
    "externalSubscriptionId" TEXT NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StravaWebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StravaWebhookEvent" (
    "id" TEXT NOT NULL,
    "ownerAthleteId" TEXT,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "aspectType" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "processingStatus" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StravaWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StravaActivityCache" (
    "id" TEXT NOT NULL,
    "wearableConnectionId" TEXT NOT NULL,
    "stravaActivityId" TEXT NOT NULL,
    "sportType" TEXT,
    "startedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StravaActivityCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StravaConnectionDetails_wearableConnectionId_key" ON "StravaConnectionDetails"("wearableConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "StravaConnectionDetails_athleteId_key" ON "StravaConnectionDetails"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "StravaWebhookSubscription_externalSubscriptionId_key" ON "StravaWebhookSubscription"("externalSubscriptionId");

-- CreateIndex
CREATE INDEX "StravaWebhookEvent_processingStatus_receivedAt_idx" ON "StravaWebhookEvent"("processingStatus", "receivedAt");

-- CreateIndex
CREATE INDEX "StravaWebhookEvent_ownerAthleteId_receivedAt_idx" ON "StravaWebhookEvent"("ownerAthleteId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StravaActivityCache_wearableConnectionId_stravaActivityId_key" ON "StravaActivityCache"("wearableConnectionId", "stravaActivityId");

-- CreateIndex
CREATE INDEX "StravaActivityCache_expiresAt_idx" ON "StravaActivityCache"("expiresAt");

-- AddForeignKey
ALTER TABLE "StravaConnectionDetails" ADD CONSTRAINT "StravaConnectionDetails_wearableConnectionId_fkey" FOREIGN KEY ("wearableConnectionId") REFERENCES "WearableConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data migration: canonicalize Activity.sportType (Req 6.6, 7.5)
--
-- Step 1 preserves provenance: copy the current raw sportType into the new
-- providerSportType column. It only touches rows where providerSportType has
-- not been set yet, which makes the whole migration idempotent (safe to re-run)
-- and a no-op on an empty table.
-- ---------------------------------------------------------------------------
UPDATE "Activity"
SET "providerSportType" = "sportType"
WHERE "providerSportType" IS NULL;

-- Step 2 maps the raw value onto the canonical RyvanoSportType taxonomy. Since
-- all existing activities come from Garmin, this mirrors parseGarminSportType:
-- exact Garmin typeKey matches first, then a conservative keyword fallback
-- (specific rules before generic ones), and finally 'default' for anything
-- unrecognized. The normalized expression lowercases the value and collapses any
-- non-alphanumeric separators (_, -, .) into single spaces. Portuguese/diacritic
-- keyword variants from the TS parser are intentionally omitted here because the
-- persisted values are Garmin English typeKeys; the original string is retained
-- in providerSportType so the mapping can be corrected later without data loss.
-- This step is also idempotent: canonical values (run/bike/swim/...) re-map to
-- themselves via the keyword rules below.
WITH normalized AS (
    SELECT
        "id",
        trim(regexp_replace(lower(coalesce("sportType", '')), '[^a-z0-9]+', ' ', 'g')) AS n
    FROM "Activity"
)
UPDATE "Activity" a
SET "sportType" = CASE
    -- Exact Garmin typeKeys (space-normalized) --------------------------------
    WHEN normalized.n IN ('running', 'street running', 'treadmill running', 'track running', 'indoor running', 'virtual run', 'obstacle run') THEN 'run'
    WHEN normalized.n IN ('trail running', 'ultra run') THEN 'trail-run'
    WHEN normalized.n IN ('cycling', 'road biking', 'indoor cycling', 'virtual ride', 'gravel cycling', 'cyclocross', 'track cycling', 'bmx', 'e bike fitness') THEN 'bike'
    WHEN normalized.n IN ('mountain biking', 'downhill biking', 'e bike mountain') THEN 'mtb'
    WHEN normalized.n IN ('swimming', 'lap swimming', 'pool swimming') THEN 'swim'
    WHEN normalized.n IN ('open water swimming', 'open water') THEN 'open-water'
    WHEN normalized.n IN ('walking', 'casual walking', 'speed walking') THEN 'walking'
    WHEN normalized.n IN ('hiking', 'mountaineering') THEN 'hiking'
    WHEN normalized.n IN ('strength training', 'indoor cardio', 'cardio', 'hiit', 'fitness equipment', 'yoga', 'pilates') THEN 'gym'
    WHEN normalized.n IN ('crossfit') THEN 'crossfit'
    WHEN normalized.n IN ('multi sport', 'triathlon') THEN 'triathlon'
    WHEN normalized.n IN ('duathlon') THEN 'duathlon'
    WHEN normalized.n IN ('aquathlon') THEN 'aquathlon'
    WHEN normalized.n IN ('rowing', 'indoor rowing') THEN 'rowing'
    WHEN normalized.n IN ('kayaking') THEN 'kayak'
    WHEN normalized.n IN ('stand up paddleboarding') THEN 'stand-up-paddle'
    WHEN normalized.n IN ('surfing') THEN 'surf'
    WHEN normalized.n IN ('soccer', 'football') THEN 'football'
    WHEN normalized.n IN ('futsal') THEN 'futsal'
    WHEN normalized.n IN ('basketball') THEN 'basketball'
    WHEN normalized.n IN ('volleyball') THEN 'volleyball'
    WHEN normalized.n IN ('tennis') THEN 'tennis'
    WHEN normalized.n IN ('padel') THEN 'padel'
    -- Keyword fallback: specific variants before generic ones -----------------
    WHEN normalized.n LIKE '%open water%' THEN 'open-water'
    WHEN normalized.n LIKE '%mountain bik%' OR normalized.n LIKE '%mtb%' OR normalized.n LIKE '%downhill%' THEN 'mtb'
    WHEN normalized.n LIKE '%trail%' OR normalized.n LIKE '%ultra%' THEN 'trail-run'
    WHEN normalized.n LIKE '%triathlon%' OR normalized.n LIKE '%multisport%' OR normalized.n LIKE '%multi sport%' THEN 'triathlon'
    WHEN normalized.n LIKE '%duathlon%' THEN 'duathlon'
    WHEN normalized.n LIKE '%aquathlon%' THEN 'aquathlon'
    WHEN normalized.n LIKE '%swim%' OR normalized.n LIKE '%pool%' THEN 'swim'
    WHEN normalized.n LIKE '%bike%' OR normalized.n LIKE '%cycl%' OR normalized.n LIKE '%ride%' THEN 'bike'
    WHEN normalized.n LIKE '%run%' OR normalized.n LIKE '%treadmill%' THEN 'run'
    WHEN normalized.n LIKE '%hiking%' OR normalized.n LIKE '%hike%' OR normalized.n LIKE '%mountaineer%' THEN 'hiking'
    WHEN normalized.n LIKE '%walk%' THEN 'walking'
    WHEN normalized.n LIKE '%crossfit%' THEN 'crossfit'
    WHEN normalized.n LIKE '%strength%' OR normalized.n LIKE '%cardio%' OR normalized.n LIKE '%hiit%' OR normalized.n LIKE '%fitness%' OR normalized.n LIKE '%yoga%' OR normalized.n LIKE '%pilates%' OR normalized.n LIKE '%gym%' THEN 'gym'
    WHEN normalized.n LIKE '%row%' THEN 'rowing'
    WHEN normalized.n LIKE '%kayak%' OR normalized.n LIKE '%canoe%' THEN 'kayak'
    WHEN normalized.n LIKE '%paddle%' THEN 'stand-up-paddle'
    WHEN normalized.n LIKE '%surf%' THEN 'surf'
    WHEN normalized.n LIKE '%futsal%' THEN 'futsal'
    WHEN normalized.n LIKE '%soccer%' OR normalized.n LIKE '%football%' THEN 'football'
    WHEN normalized.n LIKE '%basket%' THEN 'basketball'
    WHEN normalized.n LIKE '%volley%' THEN 'volleyball'
    WHEN normalized.n LIKE '%padel%' THEN 'padel'
    WHEN normalized.n LIKE '%tennis%' THEN 'tennis'
    ELSE 'default'
END
FROM normalized
WHERE a."id" = normalized."id";
