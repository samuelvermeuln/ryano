-- TM006 — TrainingLicense: activation, timezone, PAUSED/COMPLETED states.
--
-- Q1 decided here (license permanence): access is PERMANENT by default — no
-- forced expiry, `expiresAt` stays optional for a future time-boxed offer
-- type. "Pause" is a status transition on THIS license row (ACTIVE<->PAUSED),
-- never a second license. Restart count/policy (how many times the same
-- plan can be restarted) is deliberately NOT modeled at the schema level in
-- this migration — it is an undecided product policy, and baking a limit
-- into the schema now would encode a guess as a constraint. Revisit
-- explicitly with Product before TM041 ships restart UI.
--
-- `TrainingLicenseStatus` gains PAUSED/COMPLETED. All existing rows are
-- ACTIVE today (per verification in STATUS.md §2), so widening the enum is
-- safe with no backfill.

ALTER TYPE "TrainingLicenseStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "TrainingLicenseStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

CREATE TYPE "TrainingLicenseActivationMode" AS ENUM ('START_NOW', 'START_ON_DATE', 'TARGET_EVENT_DATE');
CREATE TYPE "TrainingLicenseActivationStatus" AS ENUM ('PENDING', 'ACTIVATED');

ALTER TABLE "TrainingLicense"
    ADD COLUMN "activationMode"         "TrainingLicenseActivationMode",
    ADD COLUMN "activationStatus"       "TrainingLicenseActivationStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "timezone"               VARCHAR(64),
    ADD COLUMN "chosenStartLocalDate"   VARCHAR(10),
    ADD COLUMN "anchorEventLocalDate"   VARCHAR(10),
    ADD COLUMN "calendarInstantiatedAt" TIMESTAMPTZ(3),
    ADD COLUMN "completedAt"            TIMESTAMPTZ(3);

-- Backfill: licenses whose calendar was already instantiated before this
-- migration are, by definition, already activated — reflect that instead of
-- leaving activationStatus=PENDING for rows that have a full calendar.
UPDATE "TrainingLicense" SET "activationStatus" = 'ACTIVATED' WHERE "calendarInstantiated" = true;

CREATE INDEX IF NOT EXISTS "TrainingLicense_activationStatus_idx" ON "TrainingLicense" ("activationStatus");

-- Rollback (manual, in reverse order):
--   DROP INDEX IF EXISTS "TrainingLicense_activationStatus_idx";
--   ALTER TABLE "TrainingLicense"
--       DROP COLUMN IF EXISTS "completedAt", DROP COLUMN IF EXISTS "calendarInstantiatedAt",
--       DROP COLUMN IF EXISTS "anchorEventLocalDate", DROP COLUMN IF EXISTS "chosenStartLocalDate",
--       DROP COLUMN IF EXISTS "timezone", DROP COLUMN IF EXISTS "activationStatus",
--       DROP COLUMN IF EXISTS "activationMode";
--   DROP TYPE IF EXISTS "TrainingLicenseActivationStatus";
--   DROP TYPE IF EXISTS "TrainingLicenseActivationMode";
--   -- PAUSED/COMPLETED cannot be removed from TrainingLicenseStatus without
--   -- recreating the enum type (Postgres has no DROP VALUE); only attempt
--   -- this if no row uses either value.
