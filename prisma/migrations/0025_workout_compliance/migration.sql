-- T190: workout_compliance table
-- Stores the result of the compliance calculation for a specific execution.
-- One execution → one compliance record (upserted on recalculation).
-- algorithm_version is stamped at calculation time so score changes over
-- algorithm upgrades are traceable (T206 / T212).

CREATE TABLE "WorkoutCompliance" (
  "id"                    TEXT NOT NULL,
  "workoutExecutionId"    TEXT NOT NULL,
  "workoutAssignmentId"   TEXT NOT NULL,
  "athleteId"             TEXT NOT NULL,

  -- Overall weighted compliance score 0–100
  "overallScore"          INTEGER NOT NULL,

  -- Per-dimension breakdown stored as JSON:
  -- { distance?: number, duration?: number, pace?: number,
  --   heartRate?: number, power?: number, intervals?: number,
  --   rest?: number, zones?: number }
  "breakdown"             JSONB NOT NULL DEFAULT '{}',

  -- Sport-specific strategy that was used (e.g. "run", "swim", "default")
  "strategyKey"           TEXT NOT NULL,

  -- Monotonic integer bumped with each algorithm change (T206)
  "algorithmVersion"      INTEGER NOT NULL,

  "calculatedAt"          TIMESTAMP(3) NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkoutCompliance_pkey" PRIMARY KEY ("id")
);

-- One compliance record per execution (upsert key)
CREATE UNIQUE INDEX "WorkoutCompliance_workoutExecutionId_key"
  ON "WorkoutCompliance"("workoutExecutionId");

-- Lookup by assignment
CREATE INDEX "WorkoutCompliance_workoutAssignmentId_idx"
  ON "WorkoutCompliance"("workoutAssignmentId");

-- Lookup by athlete
CREATE INDEX "WorkoutCompliance_athleteId_idx"
  ON "WorkoutCompliance"("athleteId");

-- FK to WorkoutExecution
ALTER TABLE "WorkoutCompliance"
  ADD CONSTRAINT "WorkoutCompliance_workoutExecutionId_fkey"
  FOREIGN KEY ("workoutExecutionId")
  REFERENCES "WorkoutExecution"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- FK to WorkoutAssignment
ALTER TABLE "WorkoutCompliance"
  ADD CONSTRAINT "WorkoutCompliance_workoutAssignmentId_fkey"
  FOREIGN KEY ("workoutAssignmentId")
  REFERENCES "WorkoutAssignment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
