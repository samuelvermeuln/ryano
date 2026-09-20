-- AddColumn WorkoutAssignment.garminWorkoutId
ALTER TABLE "WorkoutAssignment" ADD COLUMN IF NOT EXISTS "garminWorkoutId" TEXT;

-- AddColumn WorkoutAssignment.garminPushStatus
-- Values: PENDING | PUSHED | FAILED
ALTER TABLE "WorkoutAssignment" ADD COLUMN IF NOT EXISTS "garminPushStatus" TEXT;

-- AddColumn WorkoutAssignment.garminPushedAt
ALTER TABLE "WorkoutAssignment" ADD COLUMN IF NOT EXISTS "garminPushedAt" TIMESTAMPTZ(3);

-- AddColumn WorkoutAssignment.garminPushError
ALTER TABLE "WorkoutAssignment" ADD COLUMN IF NOT EXISTS "garminPushError" TEXT;
