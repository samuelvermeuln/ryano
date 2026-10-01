-- SAM-28 — editable public profiles.
--
-- School: achievements/specialties (free text, bounded by the DTO) and the
-- administrative contact shown to athletes (falls back to the OWNER when null).
-- CoachProfile: canonical sport types, credentials, and whether the coach takes
-- athletes outside a school (default true keeps today's behaviour).
-- Purely additive, every column has a default or is nullable: no backfill.
-- Rollback: see architecture/escola-migration-checklist.md (SAM-28).
ALTER TABLE "School"
  ADD COLUMN "achievements"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "specialties"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "adminContactUserId" TEXT;

ALTER TABLE "School"
  ADD CONSTRAINT "School_adminContactUserId_fkey"
  FOREIGN KEY ("adminContactUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "School_adminContactUserId_idx" ON "School"("adminContactUserId");

ALTER TABLE "CoachProfile"
  ADD COLUMN "sportTypes"                 TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "credentials"                TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "acceptsIndependentAthletes" BOOLEAN NOT NULL DEFAULT true;
