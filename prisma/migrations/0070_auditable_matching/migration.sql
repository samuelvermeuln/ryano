-- SAM-62 — auditable and reversible prescription ↔ activity matching (§2.2, §17.3, AC10).
-- Additive: the explanation of each link (dimensions/weights/facts/algorithm),
-- who and how it was linked, undo without deleting (who/when/why) and the
-- "removed at the provider" mark that keeps the link and the review for audit.

ALTER TABLE "WorkoutExecution"
  ADD COLUMN "matchDetail"       JSONB,
  ADD COLUMN "matchMethod"       VARCHAR(20),
  ADD COLUMN "matchedByUserId"   TEXT,
  ADD COLUMN "unlinkedAt"        TIMESTAMPTZ(3),
  ADD COLUMN "unlinkedByUserId"  TEXT,
  ADD COLUMN "unlinkReason"      VARCHAR(500),
  ADD COLUMN "providerRemovedAt" TIMESTAMPTZ(3);

ALTER TABLE "WorkoutExecution"
  ADD CONSTRAINT "WorkoutExecution_matchMethod_check"
  CHECK ("matchMethod" IS NULL OR "matchMethod" IN ('AUTO', 'ATHLETE', 'COACH', 'MANUAL_ENTRY', 'STRUCTURED_ID'));

-- An undone link is NO_MATCH with its trail; never a link with an unlink date.
ALTER TABLE "WorkoutExecution"
  ADD CONSTRAINT "WorkoutExecution_unlinked_check"
  CHECK ("unlinkedAt" IS NULL OR "matchStatus" = 'NO_MATCH');

-- Rollback (manual):
-- ALTER TABLE "WorkoutExecution" DROP CONSTRAINT "WorkoutExecution_unlinked_check";
-- ALTER TABLE "WorkoutExecution" DROP CONSTRAINT "WorkoutExecution_matchMethod_check";
-- ALTER TABLE "WorkoutExecution" DROP COLUMN "providerRemovedAt", DROP COLUMN "unlinkReason",
--   DROP COLUMN "unlinkedByUserId", DROP COLUMN "unlinkedAt", DROP COLUMN "matchedByUserId",
--   DROP COLUMN "matchMethod", DROP COLUMN "matchDetail";
