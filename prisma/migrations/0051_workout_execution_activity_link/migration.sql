-- SAM-17 — explicit link WorkoutExecution -> Activity.
--
-- Until now an execution pointed at its imported activity only implicitly, by
-- (source, externalId) against Activity (provider, externalId, userId), with
-- `source` stored in inconsistent casing ("strava" / "GARMIN") and
-- `WorkoutAssignment.matchedActivityId` never written. This migration:
--   1. adds a nullable FK `WorkoutExecution.activityId` (expand);
--   2. backfills it, idempotently, for executions whose (UPPER(source),
--      externalId, athleteId) resolves to exactly one Activity row — the same
--      rule the match flow applies from now on;
--   3. adds the FK on the already-existing `WorkoutAssignment.matchedActivityId`
--      (every value is NULL today, so the constraint cannot fail);
--   4. backfills `matchedActivityId` / `matchedAt` / `matchScore` from the most
--      recent matched execution that has an `activityId`.
--
-- Additive only. Self-reports ("self-report", "MANUAL") and activities never
-- synced into Ryvano stay NULL. Rollback: drop the two FKs, the index and the
-- `activityId` column; the backfilled assignment columns existed before and
-- may be left as they are. Safe to re-run: every UPDATE is guarded by IS NULL.

ALTER TABLE "WorkoutExecution" ADD COLUMN "activityId" TEXT;

CREATE INDEX "WorkoutExecution_activityId_idx" ON "WorkoutExecution"("activityId");

ALTER TABLE "WorkoutExecution"
  ADD CONSTRAINT "WorkoutExecution_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Backfill executions. `provider` is an enum; compare as text.
UPDATE "WorkoutExecution" e
SET "activityId" = a."id"
FROM "Activity" a
WHERE e."activityId" IS NULL
  AND a."userId" = e."athleteId"
  AND a."externalId" = e."externalId"
  AND a."provider"::text = UPPER(e."source");

-- 3. FK on the pre-existing column.
ALTER TABLE "WorkoutAssignment"
  ADD CONSTRAINT "WorkoutAssignment_matchedActivityId_fkey"
  FOREIGN KEY ("matchedActivityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Backfill the assignment's match pointer from its latest matched execution.
UPDATE "WorkoutAssignment" wa
SET "matchedActivityId" = latest."activityId",
    "matchedAt" = COALESCE(wa."matchedAt", latest."createdAt"),
    "matchScore" = COALESCE(wa."matchScore", latest."matchScore"::double precision),
    "matchStatus" = COALESCE(wa."matchStatus", latest."matchStatus"::text)
FROM (
  SELECT DISTINCT ON (e."workoutAssignmentId")
         e."workoutAssignmentId", e."activityId", e."createdAt", e."matchScore", e."matchStatus"
  FROM "WorkoutExecution" e
  WHERE e."activityId" IS NOT NULL
    AND e."matchStatus" IN ('AUTO_MATCHED', 'CONFIRMED', 'OVERRIDDEN')
  ORDER BY e."workoutAssignmentId", e."createdAt" DESC
) latest
WHERE wa."id" = latest."workoutAssignmentId"
  AND wa."matchedActivityId" IS NULL;
