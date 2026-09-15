-- Additive temporal coach assignments. Athletes remain User identities.
CREATE TYPE "AssignmentStatus" AS ENUM (
    'PENDING',
    'ACTIVE',
    'REJECTED',
    'REVOKED',
    'ENDED'
);

CREATE TABLE "CoachAthleteAssignment" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "schoolId" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "sportType" VARCHAR,
    "startedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "assignedBy" TEXT,
    "endedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CoachAthleteAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoachAthleteAssignment_pending_startedAt_check"
    CHECK ("status" <> 'PENDING' OR "startedAt" IS NULL)
);

CREATE INDEX "CoachAthleteAssignment_schoolId_athleteId_status_idx"
ON "CoachAthleteAssignment"("schoolId", "athleteId", "status");

CREATE INDEX "CoachAthleteAssignment_coachId_status_idx"
ON "CoachAthleteAssignment"("coachId", "status");

-- Preserve past periods and permit non-primary assignments. The MVP primary
-- constraint is school-scoped; independent coaches do not share a school.
CREATE UNIQUE INDEX "CoachAthleteAssignment_active_primary_school_athlete_key"
ON "CoachAthleteAssignment"("schoolId", "athleteId")
WHERE "status" = 'ACTIVE' AND "isPrimary" = true AND "schoolId" IS NOT NULL;

ALTER TABLE "CoachAthleteAssignment" ADD CONSTRAINT "CoachAthleteAssignment_athleteId_fkey"
FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CoachAthleteAssignment" ADD CONSTRAINT "CoachAthleteAssignment_coachId_fkey"
FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CoachAthleteAssignment" ADD CONSTRAINT "CoachAthleteAssignment_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
