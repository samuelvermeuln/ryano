-- Additive temporal coach-school links. Application rollback retains all history.
-- Prisma supplies CUID IDs and updatedAt, consistently with SchoolMembership.
CREATE TABLE "CoachSchoolMembership" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CoachSchoolMembership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoachSchoolMembership_pending_startedAt_check"
    CHECK ("status" <> 'PENDING' OR "startedAt" IS NULL)
);

CREATE INDEX "CoachSchoolMembership_schoolId_status_idx"
ON "CoachSchoolMembership"("schoolId", "status");

CREATE INDEX "CoachSchoolMembership_coachId_status_idx"
ON "CoachSchoolMembership"("coachId", "status");

-- Returning coaches create a new period without overwriting ended relationships.
CREATE UNIQUE INDEX "CoachSchoolMembership_active_school_coach_key"
ON "CoachSchoolMembership"("schoolId", "coachId")
WHERE "status" = 'ACTIVE';

ALTER TABLE "CoachSchoolMembership" ADD CONSTRAINT "CoachSchoolMembership_coachId_fkey"
FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CoachSchoolMembership" ADD CONSTRAINT "CoachSchoolMembership_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
