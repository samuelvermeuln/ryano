-- Preserve the applied 0010 migration: add the pending-period invariant separately.
-- Existing rows are validated, never rewritten; inconsistent data blocks deployment.
ALTER TABLE "SchoolMembership"
ADD CONSTRAINT "SchoolMembership_pending_startedAt_check"
CHECK ("status" <> 'PENDING' OR "startedAt" IS NULL);
