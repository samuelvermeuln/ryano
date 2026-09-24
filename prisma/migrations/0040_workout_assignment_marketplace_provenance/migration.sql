-- TM007 — WorkoutAssignment: marketplace provenance (RF-110, design D-06).
--
-- All columns nullable and additive: existing rows (school-prescribed,
-- non-license assignments) are unaffected. `effectiveRevisionId` is left as
-- a plain column (no FK) — PlanAdaptation does not exist until TM008/0041;
-- it will be linked as a real relation there instead of this migration
-- guessing at a table that does not exist yet.

ALTER TABLE "WorkoutAssignment"
    ADD COLUMN "planSessionId"      TEXT,
    ADD COLUMN "originalSnapshot"   JSONB,
    ADD COLUMN "effectiveRevisionId" TEXT,
    ADD COLUMN "adjustedByCoachId"  TEXT,
    ADD COLUMN "sourceLabel"        VARCHAR(200);

ALTER TABLE "WorkoutAssignment"
    ADD CONSTRAINT "WorkoutAssignment_adjustedByCoachId_fkey"
    FOREIGN KEY ("adjustedByCoachId") REFERENCES "CoachProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "WorkoutAssignment_planSessionId_idx" ON "WorkoutAssignment" ("planSessionId");
CREATE INDEX IF NOT EXISTS "WorkoutAssignment_adjustedByCoachId_idx" ON "WorkoutAssignment" ("adjustedByCoachId");

-- Rollback (manual, in reverse order):
--   DROP INDEX IF EXISTS "WorkoutAssignment_adjustedByCoachId_idx";
--   DROP INDEX IF EXISTS "WorkoutAssignment_planSessionId_idx";
--   ALTER TABLE "WorkoutAssignment" DROP CONSTRAINT IF EXISTS "WorkoutAssignment_adjustedByCoachId_fkey";
--   ALTER TABLE "WorkoutAssignment"
--       DROP COLUMN IF EXISTS "sourceLabel", DROP COLUMN IF EXISTS "adjustedByCoachId",
--       DROP COLUMN IF EXISTS "effectiveRevisionId", DROP COLUMN IF EXISTS "originalSnapshot",
--       DROP COLUMN IF EXISTS "planSessionId";
