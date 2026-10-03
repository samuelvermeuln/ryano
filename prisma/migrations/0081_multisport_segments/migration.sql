-- SAM-75 — triathlon / multisport (§16, §17.3, §21.1, §22.5, AC13).
-- A per-sport copy of a multisport session points at its parent and counts
-- once; segments are the provider's legs or explicit selections (never a
-- merge); a brick is an ordered chain of sessions; goals may name a segment.

ALTER TABLE "Activity" ADD COLUMN "parentActivityId" TEXT;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_parentActivityId_fkey" FOREIGN KEY ("parentActivityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Activity_parentActivityId_idx" ON "Activity"("parentActivityId");

CREATE TABLE "ActivitySegment" (
  "id"                  TEXT NOT NULL,
  "activityId"          TEXT NOT NULL,
  "order"               INTEGER NOT NULL,
  "kind"                VARCHAR(10) NOT NULL,
  "sportType"           VARCHAR(100),
  "startOffsetSeconds"  INTEGER NOT NULL,
  "endOffsetSeconds"    INTEGER NOT NULL,
  "distanceMeters"      DECIMAL(14, 3),
  "origin"              VARCHAR(20) NOT NULL,
  "label"               VARCHAR(120),
  "workoutAssignmentId" TEXT,
  "createdByUserId"     TEXT,
  "createdAt"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivitySegment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivitySegment_kind_check" CHECK ("kind" IN ('SWIM', 'T1', 'BIKE', 'T2', 'RUN', 'OTHER')),
  CONSTRAINT "ActivitySegment_origin_check" CHECK ("origin" IN ('PROVIDER', 'ATHLETE_SELECTION', 'COACH_SELECTION')),
  CONSTRAINT "ActivitySegment_range_check" CHECK ("startOffsetSeconds" >= 0 AND "endOffsetSeconds" > "startOffsetSeconds")
);
CREATE INDEX "ActivitySegment_activityId_order_idx" ON "ActivitySegment"("activityId", "order");
CREATE INDEX "ActivitySegment_workoutAssignmentId_idx" ON "ActivitySegment"("workoutAssignmentId");
ALTER TABLE "ActivitySegment" ADD CONSTRAINT "ActivitySegment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivitySegment" ADD CONSTRAINT "ActivitySegment_workoutAssignmentId_fkey" FOREIGN KEY ("workoutAssignmentId") REFERENCES "WorkoutAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Brick: sessions chained in order (same day, or separate with the link).
ALTER TABLE "WorkoutAssignment" ADD COLUMN "brickGroupId" TEXT;
ALTER TABLE "WorkoutAssignment" ADD COLUMN "brickOrder" INTEGER;
CREATE INDEX "WorkoutAssignment_brickGroupId_idx" ON "WorkoutAssignment"("brickGroupId");

-- A goal of a multisport participation may name its segment (§16.2).
ALTER TABLE "AthleteGoal" ADD COLUMN "segment" VARCHAR(10);
ALTER TABLE "AthleteGoal" ADD CONSTRAINT "AthleteGoal_segment_check" CHECK ("segment" IS NULL OR "segment" IN ('SWIM', 'T1', 'BIKE', 'T2', 'RUN'));

-- Rollback (manual):
-- ALTER TABLE "AthleteGoal" DROP CONSTRAINT "AthleteGoal_segment_check"; ALTER TABLE "AthleteGoal" DROP COLUMN "segment";
-- ALTER TABLE "WorkoutAssignment" DROP COLUMN "brickOrder"; ALTER TABLE "WorkoutAssignment" DROP COLUMN "brickGroupId";
-- DROP TABLE "ActivitySegment";
-- ALTER TABLE "Activity" DROP CONSTRAINT "Activity_parentActivityId_fkey"; ALTER TABLE "Activity" DROP COLUMN "parentActivityId";