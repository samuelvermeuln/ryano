-- Workout assignment lifecycle: links a concrete workout to an athlete with status tracking.
CREATE TYPE "WorkoutAssignmentStatus" AS ENUM (
    'SCHEDULED',
    'AVAILABLE',
    'COMPLETED',
    'PARTIALLY_COMPLETED',
    'MISSED',
    'CANCELLED',
    'RESCHEDULED',
    'JUSTIFIED',
    'UNPLANNED'
);

CREATE TABLE "WorkoutAssignment" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "schoolId" TEXT,
    "coachId" TEXT,
    "teamId" TEXT,
    "scheduledAt" TIMESTAMPTZ(3),
    "dueAt" TIMESTAMPTZ(3),
    "status" "WorkoutAssignmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WorkoutAssignment_pkey" PRIMARY KEY ("id")
);

-- Immutable audit trail; each status transition appends a row.
CREATE TABLE "WorkoutAssignmentHistory" (
    "id" TEXT NOT NULL,
    "workoutAssignmentId" TEXT NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkoutAssignmentHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkoutAssignment_athleteId_status_id_idx" ON "WorkoutAssignment"("athleteId", "status", "id");
CREATE INDEX "WorkoutAssignment_teamId_status_idx" ON "WorkoutAssignment"("teamId", "status");
CREATE INDEX "WorkoutAssignment_schoolId_status_idx" ON "WorkoutAssignment"("schoolId", "status");
CREATE INDEX "WorkoutAssignment_coachId_status_idx" ON "WorkoutAssignment"("coachId", "status");
CREATE INDEX "WorkoutAssignmentHistory_workoutAssignmentId_createdAt_idx" ON "WorkoutAssignmentHistory"("workoutAssignmentId", "createdAt");

ALTER TABLE "WorkoutAssignment" ADD CONSTRAINT "WorkoutAssignment_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignment" ADD CONSTRAINT "WorkoutAssignment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignment" ADD CONSTRAINT "WorkoutAssignment_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignment" ADD CONSTRAINT "WorkoutAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignment" ADD CONSTRAINT "WorkoutAssignment_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- teamId uses SetNull to avoid blocking Team archival; set null when a team is deleted.
ALTER TABLE "WorkoutAssignment" ADD CONSTRAINT "WorkoutAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignmentHistory" ADD CONSTRAINT "WorkoutAssignmentHistory_workoutAssignmentId_fkey" FOREIGN KEY ("workoutAssignmentId") REFERENCES "WorkoutAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignmentHistory" ADD CONSTRAINT "WorkoutAssignmentHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
