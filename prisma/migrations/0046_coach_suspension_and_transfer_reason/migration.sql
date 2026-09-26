-- Organograma: per-school coach suspension and a reason for athlete transfers.
--
-- Purely additive (three nullable columns), so this is safe to apply on a live
-- database and needs no backfill: NULL suspendedAt means "not suspended", which
-- is the correct state for every existing row.

-- Why not CoachProfile.status (CoachStatus ACTIVE/INACTIVE): that column is
-- global to the coach, while CoachSchoolMembership is per school. Reusing it
-- would let one school deactivate a coach inside every other school they work
-- for. Suspension is a property of the school link, so it lives here.
--
-- Why not MembershipStatus ENDED/REVOKED: those mean the coach left the school,
-- and the code that produces them (RemoveCoachFromSchool) also ends every
-- athlete assignment and cancels future prescriptions. Suspension must keep all
-- of that intact and be reversible, which the ENDED transition is not.
ALTER TABLE "CoachSchoolMembership"
    ADD COLUMN "suspendedAt" TIMESTAMPTZ(3),
    ADD COLUMN "suspendedBy" TEXT;

-- Either both suspension fields are set or neither is: a suspended link must
-- always say who suspended it, and a live link must carry no suspender.
ALTER TABLE "CoachSchoolMembership"
    ADD CONSTRAINT "CoachSchoolMembership_suspension_pair_check" CHECK (
        ("suspendedAt" IS NULL AND "suspendedBy" IS NULL)
        OR ("suspendedAt" IS NOT NULL AND "suspendedBy" IS NOT NULL)
    );

-- Only an ACTIVE link can be suspended. A PENDING request has nothing to
-- suspend, and an ENDED/REVOKED one is already closed; allowing both would
-- create two competing notions of "inactive" for the same row.
ALTER TABLE "CoachSchoolMembership"
    ADD CONSTRAINT "CoachSchoolMembership_suspension_requires_active_check" CHECK (
        "suspendedAt" IS NULL OR "status" = 'ACTIVE'
    );

ALTER TABLE "CoachSchoolMembership"
    ADD CONSTRAINT "CoachSchoolMembership_suspendedBy_fkey"
        FOREIGN KEY ("suspendedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The organograma reads "active, not suspended coaches of this school" on every
-- load; a partial index keeps that cheap as the school grows.
CREATE INDEX "CoachSchoolMembership_schoolId_active_unsuspended_idx"
    ON "CoachSchoolMembership" ("schoolId")
    WHERE "status" = 'ACTIVE' AND "suspendedAt" IS NULL;

-- Reason the period was opened, recorded when an administrator transfers an
-- athlete. It belongs to the period the transfer created, so the previous
-- (closed) period keeps whatever reason it was originally opened with.
ALTER TABLE "CoachAthleteAssignment"
    ADD COLUMN "reason" VARCHAR(500);

-- Rollback (manual, in reverse order):
--   DROP INDEX IF EXISTS "CoachSchoolMembership_schoolId_active_unsuspended_idx";
--   ALTER TABLE "CoachSchoolMembership"
--     DROP CONSTRAINT IF EXISTS "CoachSchoolMembership_suspendedBy_fkey",
--     DROP CONSTRAINT IF EXISTS "CoachSchoolMembership_suspension_requires_active_check",
--     DROP CONSTRAINT IF EXISTS "CoachSchoolMembership_suspension_pair_check",
--     DROP COLUMN IF EXISTS "suspendedBy",
--     DROP COLUMN IF EXISTS "suspendedAt";
--   ALTER TABLE "CoachAthleteAssignment" DROP COLUMN IF EXISTS "reason";
-- Dropping these discards which coaches were suspended and why athletes were
-- transferred; export before rolling back in production.
