-- SAM-30 — independent coaching context + athlete transfers.
--
-- 1. The technical sheet is "parameters of one coaching relationship". Inside a
--    school that relationship is (schoolId, athleteId); outside one it is
--    (coachId, athleteId) — an athlete may have two independent coaches, so the
--    sheet cannot be keyed by athlete alone. `schoolId` becomes nullable, `coachId`
--    is added, a CHECK demands one of them, and a partial unique index keeps one
--    independent sheet per (coach, athlete). The existing unique on
--    (schoolId, athleteId) stays: Postgres treats NULLs as distinct, so the school
--    path is untouched.
-- 2. `AthleteTechnicalSheetRevision.schoolId` and `CoachEvaluation.schoolId`
--    become nullable for the same reason.
-- 3. One ACTIVE independent link per (athlete, coach) is enforced in the
--    database (it was application-level only, under Serializable transactions).
--    The DO block aborts the migration if duplicates already exist, so they are
--    ended by hand instead of silently failing the index build.
-- 4. Two notification kinds for the transfer proposals.
--
-- Partial unique indexes are not expressible in schema.prisma (same precedent
-- as migration 0016 — see the comment on CoachAthleteAssignment there).

ALTER TABLE "AthleteTechnicalSheet"
  ALTER COLUMN "schoolId" DROP NOT NULL,
  ADD COLUMN "coachId" TEXT;

ALTER TABLE "AthleteTechnicalSheet"
  ADD CONSTRAINT "AthleteTechnicalSheet_coachId_fkey"
  FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AthleteTechnicalSheet"
  ADD CONSTRAINT "AthleteTechnicalSheet_scope_check"
  CHECK ("schoolId" IS NOT NULL OR "coachId" IS NOT NULL);

CREATE UNIQUE INDEX "AthleteTechnicalSheet_independent_coach_athlete_key"
  ON "AthleteTechnicalSheet"("coachId", "athleteId")
  WHERE "schoolId" IS NULL;

CREATE INDEX "AthleteTechnicalSheet_coachId_athleteId_idx"
  ON "AthleteTechnicalSheet"("coachId", "athleteId");

ALTER TABLE "AthleteTechnicalSheetRevision"
  ALTER COLUMN "schoolId" DROP NOT NULL;

ALTER TABLE "CoachEvaluation"
  ALTER COLUMN "schoolId" DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CoachAthleteAssignment"
    WHERE "status" = 'ACTIVE' AND "schoolId" IS NULL
    GROUP BY "athleteId", "coachId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate ACTIVE independent CoachAthleteAssignment rows for the same (athleteId, coachId); end the extra periods before applying 0056';
  END IF;
END $$;

CREATE UNIQUE INDEX "CoachAthleteAssignment_active_independent_pair_key"
  ON "CoachAthleteAssignment"("athleteId", "coachId")
  WHERE "status" = 'ACTIVE' AND "schoolId" IS NULL;

ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'COACH_TRANSFER_PROPOSED';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'COACH_TRANSFER_CONFIRMED';

-- Rollback (manual): DROP INDEX "CoachAthleteAssignment_active_independent_pair_key";
-- DROP INDEX "AthleteTechnicalSheet_independent_coach_athlete_key";
-- DROP INDEX "AthleteTechnicalSheet_coachId_athleteId_idx";
-- ALTER TABLE "AthleteTechnicalSheet" DROP CONSTRAINT "AthleteTechnicalSheet_scope_check",
--   DROP CONSTRAINT "AthleteTechnicalSheet_coachId_fkey", DROP COLUMN "coachId";
-- SET NOT NULL back on the three columns only after deleting rows with NULL schoolId.
-- Enum values cannot be dropped; leaving them is harmless.
