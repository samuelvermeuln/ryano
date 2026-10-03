-- SAM-68 — several coaches on one athlete (§16.4, §22.7): the primary link
-- answers for the integrated planning; non-primary links are collaborators,
-- optionally by discipline (e.g. natação). Additive; a primary has no discipline.
ALTER TABLE "CoachAthleteAssignment" ADD COLUMN "discipline" VARCHAR(60);
ALTER TABLE "CoachAthleteAssignment"
  ADD CONSTRAINT "CoachAthleteAssignment_discipline_check" CHECK ("isPrimary" = false OR "discipline" IS NULL);

-- Rollback (manual):
-- ALTER TABLE "CoachAthleteAssignment" DROP CONSTRAINT "CoachAthleteAssignment_discipline_check";
-- ALTER TABLE "CoachAthleteAssignment" DROP COLUMN "discipline";