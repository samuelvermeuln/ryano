-- SAM-72 — comparison by block and repetition (§17.2, §17.4, §27.2).
-- Repetitions confirmed by the athlete or the coach live with the execution
-- (the watch's auto-lap is never a repetition by itself); the adherence below
-- which DEVIATION_DETECTED is raised is the organization's choice — absent
-- means no deviation notice (no universal number).

ALTER TABLE "WorkoutExecution" ADD COLUMN "confirmedRepetitions" JSONB;
ALTER TABLE "FollowUpPolicy" ADD COLUMN "deviationAdherenceBelowPct" INTEGER;
ALTER TABLE "FollowUpPolicy" ADD CONSTRAINT "FollowUpPolicy_deviationAdherenceBelowPct_check"
  CHECK ("deviationAdherenceBelowPct" IS NULL OR ("deviationAdherenceBelowPct" BETWEEN 1 AND 100));

-- Rollback (manual):
-- ALTER TABLE "FollowUpPolicy" DROP CONSTRAINT "FollowUpPolicy_deviationAdherenceBelowPct_check";
-- ALTER TABLE "FollowUpPolicy" DROP COLUMN "deviationAdherenceBelowPct";
-- ALTER TABLE "WorkoutExecution" DROP COLUMN "confirmedRepetitions";