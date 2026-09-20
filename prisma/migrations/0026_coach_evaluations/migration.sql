-- T220: coach_evaluations
-- A coach posts a structured evaluation on an athlete's workout execution.
-- One evaluation per (workoutExecutionId, coachId) — coaches can update but
-- not create duplicates. The score is independent of the automated compliance
-- (ryvanoScore) so the two can diverge and both are preserved.
--
-- Historical evaluations are KEPT after a coach leaves the school (coachId
-- remains, no CASCADE on coach removal — T232).

CREATE TABLE "CoachEvaluation" (
  "id"                   TEXT NOT NULL,
  "workoutExecutionId"   TEXT NOT NULL,
  "workoutAssignmentId"  TEXT NOT NULL,
  "athleteId"            TEXT NOT NULL,
  "coachId"              TEXT NOT NULL,
  "schoolId"             TEXT NOT NULL,

  -- Coach's numerical score 0–10 (stored as integer *10 for precision, e.g. 85 = 8.5)
  -- Presented to users as a decimal: overallScore / 10
  "overallScore"         INTEGER NOT NULL,

  -- Optional free-text note (max 5000 chars enforced in application layer)
  "note"                 TEXT,

  -- Is this evaluation visible to the athlete? Coaches can draft first.
  "isVisible"            BOOLEAN NOT NULL DEFAULT TRUE,

  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CoachEvaluation_pkey" PRIMARY KEY ("id")
);

-- One evaluation per (execution, coach) — coach may update but not double-post
CREATE UNIQUE INDEX "CoachEvaluation_workoutExecutionId_coachId_key"
  ON "CoachEvaluation"("workoutExecutionId", "coachId");

-- Fast lookup by assignment
CREATE INDEX "CoachEvaluation_workoutAssignmentId_idx"
  ON "CoachEvaluation"("workoutAssignmentId");

-- Fast lookup by athlete
CREATE INDEX "CoachEvaluation_athleteId_idx"
  ON "CoachEvaluation"("athleteId");

-- FK to WorkoutExecution (cascade delete when execution is removed)
ALTER TABLE "CoachEvaluation"
  ADD CONSTRAINT "CoachEvaluation_workoutExecutionId_fkey"
  FOREIGN KEY ("workoutExecutionId")
  REFERENCES "WorkoutExecution"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- FK to WorkoutAssignment (cascade delete when assignment is removed)
ALTER TABLE "CoachEvaluation"
  ADD CONSTRAINT "CoachEvaluation_workoutAssignmentId_fkey"
  FOREIGN KEY ("workoutAssignmentId")
  REFERENCES "WorkoutAssignment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- FK to CoachProfile — RESTRICT (evaluation preserved after coach leaves school)
ALTER TABLE "CoachEvaluation"
  ADD CONSTRAINT "CoachEvaluation_coachId_fkey"
  FOREIGN KEY ("coachId")
  REFERENCES "CoachProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
