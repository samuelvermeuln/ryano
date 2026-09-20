-- T221: athlete_feedback
-- An athlete's subjective self-report on a workout execution.
-- Captures perceived exertion (RPE 1–10), mood, energy, and optional text.
-- One feedback per workoutExecutionId (athlete submits once, can update).

CREATE TABLE "AthleteFeedback" (
  "id"                   TEXT NOT NULL,
  "workoutExecutionId"   TEXT NOT NULL,
  "workoutAssignmentId"  TEXT NOT NULL,
  "athleteId"            TEXT NOT NULL,

  -- Rated Perceived Exertion: 1 (very easy) – 10 (maximal)
  "rpe"                  INTEGER NOT NULL,

  -- Optional subjective mood 1–5
  "mood"                 INTEGER,

  -- Optional energy level 1–5
  "energy"               INTEGER,

  -- Free-text comment (max 2000 chars enforced in application layer)
  "comment"              TEXT,

  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AthleteFeedback_pkey" PRIMARY KEY ("id")
);

-- One feedback per execution
CREATE UNIQUE INDEX "AthleteFeedback_workoutExecutionId_key"
  ON "AthleteFeedback"("workoutExecutionId");

CREATE INDEX "AthleteFeedback_workoutAssignmentId_idx"
  ON "AthleteFeedback"("workoutAssignmentId");

-- FK to WorkoutExecution
ALTER TABLE "AthleteFeedback"
  ADD CONSTRAINT "AthleteFeedback_workoutExecutionId_fkey"
  FOREIGN KEY ("workoutExecutionId")
  REFERENCES "WorkoutExecution"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- FK to WorkoutAssignment
ALTER TABLE "AthleteFeedback"
  ADD CONSTRAINT "AthleteFeedback_workoutAssignmentId_fkey"
  FOREIGN KEY ("workoutAssignmentId")
  REFERENCES "WorkoutAssignment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
