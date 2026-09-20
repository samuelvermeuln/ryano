-- Workout requests: athlete-initiated request for a coach to prescribe a workout.
-- One WorkoutRequest maps to at most one resulting WorkoutAssignment, set only
-- on approval (enforced by the unique index on resultingAssignmentId below).

CREATE TYPE "WorkoutRequestStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'DECLINED',
    'CANCELLED'
);

CREATE TABLE "WorkoutRequest" (
    "id"                    TEXT                    NOT NULL,
    "athleteId"             TEXT                    NOT NULL,
    "schoolId"              TEXT                    NOT NULL,
    "sportType"             VARCHAR(100)            NOT NULL,
    "preferredDate"         DATE,
    "note"                  TEXT,
    "status"                "WorkoutRequestStatus"  NOT NULL DEFAULT 'PENDING',
    "decidedBy"             TEXT,
    "decidedAt"             TIMESTAMPTZ(3),
    "declineReason"         TEXT,
    "resultingAssignmentId" TEXT,
    "createdAt"             TIMESTAMPTZ(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMPTZ(3)          NOT NULL,

    CONSTRAINT "WorkoutRequest_pkey" PRIMARY KEY ("id")
);

-- Enforces the 1:1 cardinality between a request and the assignment it produced.
CREATE UNIQUE INDEX "WorkoutRequest_resultingAssignmentId_key" ON "WorkoutRequest"("resultingAssignmentId");

-- Coach panel: list pending requests for a school (main query pattern).
CREATE INDEX "WorkoutRequest_schoolId_status_idx" ON "WorkoutRequest"("schoolId", "status");
-- Athlete panel: list own requests by status.
CREATE INDEX "WorkoutRequest_athleteId_status_idx" ON "WorkoutRequest"("athleteId", "status");

ALTER TABLE "WorkoutRequest" ADD CONSTRAINT "WorkoutRequest_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutRequest" ADD CONSTRAINT "WorkoutRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutRequest" ADD CONSTRAINT "WorkoutRequest_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutRequest" ADD CONSTRAINT "WorkoutRequest_resultingAssignmentId_fkey" FOREIGN KEY ("resultingAssignmentId") REFERENCES "WorkoutAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
