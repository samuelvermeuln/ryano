-- T500 — Operational fields for Team (spec defect D3).
--
-- Before this migration a team carried only a name, so the administrative UI had
-- nothing real to show: no modality, no level, no capacity, no location.
--
-- Every column is nullable and no default is written, so this is additive and
-- safe on a live table: existing rows stay valid and no rewrite is triggered.
--
-- `capacity` is a DECLARATION, not a database constraint. Enforcement lives in
-- AddAthleteToTeam (TEAM_CAPACITY_EXCEEDED). A CHECK here would make lowering
-- capacity below the current headcount impossible, which is a legitimate
-- administrative action — the existing athletes keep their place and only new
-- inclusions are blocked.

ALTER TABLE "Team"
    ADD COLUMN "sportType" VARCHAR(100),
    ADD COLUMN "level"     VARCHAR(100),
    ADD COLUMN "capacity"  INTEGER,
    ADD COLUMN "location"  VARCHAR(200),
    ADD COLUMN "notes"     VARCHAR(1000);

-- Supports the "active teams of a school filtered by modality" listing.
-- IF NOT EXISTS keeps the migration re-runnable after a partial failure.
CREATE INDEX IF NOT EXISTS "Team_schoolId_sportType_archivedAt_idx"
    ON "Team" ("schoolId", "sportType", "archivedAt");

-- Rollback (manual, in reverse order):
--   DROP INDEX IF EXISTS "Team_schoolId_sportType_archivedAt_idx";
--   ALTER TABLE "Team"
--       DROP COLUMN IF EXISTS "notes",
--       DROP COLUMN IF EXISTS "location",
--       DROP COLUMN IF EXISTS "capacity",
--       DROP COLUMN IF EXISTS "level",
--       DROP COLUMN IF EXISTS "sportType";
-- Dropping the columns discards whatever the schools had filled in; export
-- before rolling back in production.
