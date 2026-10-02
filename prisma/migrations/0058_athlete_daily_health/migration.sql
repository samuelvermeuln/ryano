-- SAM-42 — persisted daily health (ADR-005). Additive only.
--
-- One row per (user, provider, local day): what ONE connection reported for ONE
-- day. Several connections = several rows; the reader chooses one source per
-- field (`resolveDailyHealthSources`) and labels it. Every metric is nullable:
-- absence is never zero. Proprietary scores (Body Battery, Nightly Recharge…)
-- are stored with the provider's label (`energyLabel`), never converted.
--
-- Rollback: DROP TABLE "AthleteDailyHealth";

CREATE TABLE "AthleteDailyHealth" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "WearableProvider" NOT NULL,
  "date" VARCHAR(10) NOT NULL,
  "timeZone" TEXT NOT NULL,
  "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
  "restingHeartRate" INTEGER,
  "restingHeartRate7dAvg" DOUBLE PRECISION,
  "energyScore" INTEGER,
  "energyHighest" INTEGER,
  "energyLowest" INTEGER,
  "energyLabel" TEXT,
  "sleepScore" INTEGER,
  "sleepDurationSeconds" INTEGER,
  "sleepStart" TIMESTAMPTZ(3),
  "sleepEnd" TIMESTAMPTZ(3),
  "deepSleepSeconds" INTEGER,
  "lightSleepSeconds" INTEGER,
  "remSleepSeconds" INTEGER,
  "awakeSeconds" INTEGER,
  "hrvLastNight" DOUBLE PRECISION,
  "hrv7dAvg" DOUBLE PRECISION,
  "hrvStatus" TEXT,
  "readinessScore" INTEGER,
  "readinessLevel" TEXT,
  "recoveryTimeMinutes" INTEGER,
  "steps" INTEGER,
  "activeKilocalories" INTEGER,
  "totalKilocalories" INTEGER,
  "raw" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AthleteDailyHealth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AthleteDailyHealth_userId_provider_date_key" ON "AthleteDailyHealth"("userId", "provider", "date");
CREATE INDEX "AthleteDailyHealth_userId_date_idx" ON "AthleteDailyHealth"("userId", "date");

ALTER TABLE "AthleteDailyHealth"
  ADD CONSTRAINT "AthleteDailyHealth_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
