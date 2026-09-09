-- Additive temporal athlete-school links. Athletes remain User identities.
CREATE TYPE "MembershipJoinSource" AS ENUM (
    'SCHOOL_INVITE',
    'SCHOOL_COACH_INVITE',
    'COACH_INVITE',
    'MANUAL_SEARCH',
    'ADMIN_CREATED',
    'MIGRATION'
);

CREATE TABLE "SchoolAthleteMembership" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "joinSource" "MembershipJoinSource" NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMPTZ(3),
    "revokedBy" TEXT,
    "revokedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SchoolAthleteMembership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolAthleteMembership_pending_startedAt_check"
    CHECK ("status" <> 'PENDING' OR "startedAt" IS NULL)
);

CREATE INDEX "SchoolAthleteMembership_schoolId_status_idx"
ON "SchoolAthleteMembership"("schoolId", "status");

CREATE INDEX "SchoolAthleteMembership_athleteId_status_idx"
ON "SchoolAthleteMembership"("athleteId", "status");

-- Returning athletes create a new period without overwriting history.
CREATE UNIQUE INDEX "SchoolAthleteMembership_active_school_athlete_key"
ON "SchoolAthleteMembership"("schoolId", "athleteId")
WHERE "status" = 'ACTIVE';

ALTER TABLE "SchoolAthleteMembership" ADD CONSTRAINT "SchoolAthleteMembership_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SchoolAthleteMembership" ADD CONSTRAINT "SchoolAthleteMembership_athleteId_fkey"
FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
