-- Reusable templates and immutable concrete workout prescriptions.
CREATE TYPE "WorkoutOwnerType" AS ENUM ('COACH', 'SCHOOL', 'SYSTEM');
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "WorkoutStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED');
CREATE TYPE "WorkoutBlockType" AS ENUM ('WARMUP', 'INTERVAL', 'STEADY', 'RECOVERY', 'COOLDOWN', 'DRILL', 'FREE', 'CUSTOM');

CREATE TABLE "WorkoutTemplate" (
    "id" TEXT NOT NULL,
    "ownerType" "WorkoutOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "authorCoachId" TEXT,
    "schoolId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sportType" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WorkoutTemplate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkoutTemplate_version_check" CHECK ("version" >= 1),
    CONSTRAINT "WorkoutTemplate_owner_check" CHECK (
      ("ownerType" = 'COACH' AND "authorCoachId" IS NOT NULL AND "ownerId" = "authorCoachId" AND "schoolId" IS NULL)
      OR ("ownerType" = 'SCHOOL' AND "schoolId" IS NOT NULL AND "ownerId" = "schoolId")
      OR ("ownerType" = 'SYSTEM' AND "authorCoachId" IS NULL AND "schoolId" IS NULL)
    )
);

CREATE TABLE "Workout" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "authorCoachId" TEXT,
    "originSchoolId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sportType" VARCHAR(100) NOT NULL,
    "scheduledDate" DATE,
    "scheduledStartAt" TIMESTAMPTZ(3),
    "status" "WorkoutStatus" NOT NULL DEFAULT 'DRAFT',
    "snapshotPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Workout_template_snapshot_check" CHECK (
      ("templateId" IS NULL AND "templateVersion" IS NULL) OR ("templateId" IS NOT NULL AND "templateVersion" >= 1)
    )
);

CREATE TABLE "WorkoutBlock" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "blockType" "WorkoutBlockType" NOT NULL,
    "title" VARCHAR(200),
    "distanceM" DECIMAL(12,2),
    "durationS" INTEGER,
    "repetitions" INTEGER,
    "targetPayload" JSONB,
    "restPayload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WorkoutBlock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkoutBlock_nonnegative_check" CHECK (
      ("distanceM" IS NULL OR "distanceM" >= 0) AND ("durationS" IS NULL OR "durationS" >= 0) AND ("repetitions" IS NULL OR "repetitions" >= 0) AND "position" >= 0
    )
);

CREATE UNIQUE INDEX "WorkoutBlock_workoutId_position_key" ON "WorkoutBlock"("workoutId", "position");
CREATE INDEX "WorkoutTemplate_ownerType_ownerId_status_updatedAt_id_idx" ON "WorkoutTemplate"("ownerType", "ownerId", "status", "updatedAt", "id");
CREATE INDEX "WorkoutTemplate_authorCoachId_status_idx" ON "WorkoutTemplate"("authorCoachId", "status");
CREATE INDEX "WorkoutTemplate_schoolId_status_idx" ON "WorkoutTemplate"("schoolId", "status");
CREATE INDEX "Workout_templateId_templateVersion_idx" ON "Workout"("templateId", "templateVersion");
CREATE INDEX "Workout_authorCoachId_status_createdAt_id_idx" ON "Workout"("authorCoachId", "status", "createdAt", "id");
CREATE INDEX "Workout_originSchoolId_status_scheduledDate_id_idx" ON "Workout"("originSchoolId", "status", "scheduledDate", "id");
CREATE INDEX "WorkoutBlock_workoutId_position_idx" ON "WorkoutBlock"("workoutId", "position");

ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_authorCoachId_fkey" FOREIGN KEY ("authorCoachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_authorCoachId_fkey" FOREIGN KEY ("authorCoachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_originSchoolId_fkey" FOREIGN KEY ("originSchoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutBlock" ADD CONSTRAINT "WorkoutBlock_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
