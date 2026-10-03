-- SAM-63 — the training-load method is the coach's/school's choice (§17.4, T07):
-- sRPE (duration × session RPE, CR10) appears only when chosen. NULL = none.
ALTER TABLE "FollowUpPolicy" ADD COLUMN "sessionLoadMethod" VARCHAR(10);
ALTER TABLE "FollowUpPolicy"
  ADD CONSTRAINT "FollowUpPolicy_sessionLoadMethod_check"
  CHECK ("sessionLoadMethod" IS NULL OR "sessionLoadMethod" IN ('SRPE'));

-- Rollback (manual):
-- ALTER TABLE "FollowUpPolicy" DROP CONSTRAINT "FollowUpPolicy_sessionLoadMethod_check";
-- ALTER TABLE "FollowUpPolicy" DROP COLUMN "sessionLoadMethod";