-- SAM-18 — technical sheet: chosen heart-rate zone method + parameter history.
--
-- 1. `heartRateZoneMethod` (MAX_HR | HRR | LTHR), nullable: null keeps today's
--    behaviour (first method the parameters allow, %FCmáx first).
-- 2. `AthleteTechnicalSheetRevision`: one row per save that changed at least
--    one training parameter, with { field: { from, to } } — the audit log only
--    records which fields were touched, so "what was the threshold when this
--    workout was prescribed" had no answer before.
--
-- Purely additive: one nullable column, one new table. No backfill (history
-- starts now; the current sheet is the baseline). Rollback: drop the table and
-- the column.
ALTER TABLE "AthleteTechnicalSheet"
  ADD COLUMN "heartRateZoneMethod" VARCHAR(10);

ALTER TABLE "AthleteTechnicalSheet"
  ADD CONSTRAINT "AthleteTechnicalSheet_heartRateZoneMethod_check"
  CHECK ("heartRateZoneMethod" IS NULL OR "heartRateZoneMethod" IN ('MAX_HR', 'HRR', 'LTHR'));

CREATE TABLE "AthleteTechnicalSheetRevision" (
  "id"              TEXT NOT NULL,
  "sheetId"         TEXT NOT NULL,
  "schoolId"        TEXT NOT NULL,
  "athleteId"       TEXT NOT NULL,
  "changedByUserId" TEXT,
  "changes"         JSONB NOT NULL,
  "changedAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AthleteTechnicalSheetRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AthleteTechnicalSheetRevision_sheetId_changedAt_idx"
  ON "AthleteTechnicalSheetRevision"("sheetId", "changedAt" DESC);
CREATE INDEX "AthleteTechnicalSheetRevision_schoolId_athleteId_idx"
  ON "AthleteTechnicalSheetRevision"("schoolId", "athleteId");

ALTER TABLE "AthleteTechnicalSheetRevision"
  ADD CONSTRAINT "AthleteTechnicalSheetRevision_sheetId_fkey"
  FOREIGN KEY ("sheetId") REFERENCES "AthleteTechnicalSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteTechnicalSheetRevision"
  ADD CONSTRAINT "AthleteTechnicalSheetRevision_changedByUserId_fkey"
  FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
