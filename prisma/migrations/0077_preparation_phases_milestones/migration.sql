-- SAM-71 — preparation phases and verifiable milestones (§8, §6.1, §5.5, §22.4).
-- Phases are the coach's organisation (variable length, may be absent or
-- overlap); nothing is generated. A milestone says what will be observed;
-- linked evidence moves it to EVIDENCE_RECEIVED, and only the coach decides
-- ACHIEVED (the decision is a CoachReview targeting the milestone). A session
-- may be linked to several events and still counts once for the athlete.

CREATE TABLE "PreparationPhase" (
  "id"              TEXT NOT NULL,
  "preparationId"   TEXT NOT NULL,
  "type"            VARCHAR(20) NOT NULL,
  "customName"      VARCHAR(120),
  "startLocalDate"  VARCHAR(10) NOT NULL,
  "endLocalDate"    VARCHAR(10) NOT NULL,
  "purpose"         VARCHAR(1000),
  "sportTypes"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "protocolNotes"   VARCHAR(2000),
  "version"         INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "removedAt"       TIMESTAMPTZ(3),
  "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PreparationPhase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PreparationPhase_type_check" CHECK ("type" IN ('ASSESSMENT', 'BASE', 'DEVELOPMENT', 'SPECIFIC', 'TAPER', 'COMPETITION', 'RECOVERY', 'CUSTOM')),
  CONSTRAINT "PreparationPhase_custom_check" CHECK ("type" <> 'CUSTOM' OR "customName" IS NOT NULL),
  CONSTRAINT "PreparationPhase_dates_check" CHECK ("startLocalDate" ~ '^\d{4}-\d{2}-\d{2}$' AND "endLocalDate" ~ '^\d{4}-\d{2}-\d{2}$' AND "startLocalDate" <= "endLocalDate")
);
CREATE INDEX "PreparationPhase_preparationId_idx" ON "PreparationPhase"("preparationId");
ALTER TABLE "PreparationPhase" ADD CONSTRAINT "PreparationPhase_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "EventPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Changing a phase writes the previous content here, with author and reason.
CREATE TABLE "PreparationPhaseRevision" (
  "id"              TEXT NOT NULL,
  "phaseId"         TEXT NOT NULL,
  "version"         INTEGER NOT NULL,
  "snapshot"        JSONB NOT NULL,
  "reason"          VARCHAR(1000),
  "changedByUserId" TEXT NOT NULL,
  "changedAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreparationPhaseRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PreparationPhaseRevision_phaseId_idx" ON "PreparationPhaseRevision"("phaseId");
ALTER TABLE "PreparationPhaseRevision" ADD CONSTRAINT "PreparationPhaseRevision_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "PreparationPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PreparationMilestone" (
  "id"              TEXT NOT NULL,
  "preparationId"   TEXT NOT NULL,
  "phaseId"         TEXT,
  "title"           VARCHAR(200) NOT NULL,
  "criterion"       VARCHAR(2000) NOT NULL,
  "dueLocalDate"    VARCHAR(10) NOT NULL,
  "evidenceType"    VARCHAR(20) NOT NULL,
  "status"          VARCHAR(30) NOT NULL DEFAULT 'PLANNED',
  "evidenceAt"      TIMESTAMPTZ(3),
  "decidedAt"       TIMESTAMPTZ(3),
  "decidedByUserId" TEXT,
  "version"         INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PreparationMilestone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PreparationMilestone_evidenceType_check" CHECK ("evidenceType" IN ('AUTOMATIC', 'MANUAL', 'IN_PERSON', 'COMBINED')),
  CONSTRAINT "PreparationMilestone_status_check" CHECK ("status" IN ('PLANNED', 'IN_PROGRESS', 'EVIDENCE_RECEIVED', 'IN_REVIEW', 'ACHIEVED', 'PARTIALLY_ACHIEVED', 'NOT_ACHIEVED', 'CANCELLED')),
  CONSTRAINT "PreparationMilestone_due_check" CHECK ("dueLocalDate" ~ '^\d{4}-\d{2}-\d{2}$'),
  -- Only a coach's decision closes a milestone as achieved/partially/not achieved.
  CONSTRAINT "PreparationMilestone_decision_check" CHECK ("status" NOT IN ('ACHIEVED', 'PARTIALLY_ACHIEVED', 'NOT_ACHIEVED') OR ("decidedAt" IS NOT NULL AND "decidedByUserId" IS NOT NULL))
);
CREATE INDEX "PreparationMilestone_preparationId_idx" ON "PreparationMilestone"("preparationId");
ALTER TABLE "PreparationMilestone" ADD CONSTRAINT "PreparationMilestone_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "EventPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreparationMilestone" ADD CONSTRAINT "PreparationMilestone_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "PreparationPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A session tagged with an event (and optionally a phase and a milestone of its preparation).
CREATE TABLE "WorkoutAssignmentEventLink" (
  "id"              TEXT NOT NULL,
  "assignmentId"    TEXT NOT NULL,
  "participationId" TEXT NOT NULL,
  "phaseId"         TEXT,
  "milestoneId"     TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutAssignmentEventLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkoutAssignmentEventLink_assignmentId_participationId_key" ON "WorkoutAssignmentEventLink"("assignmentId", "participationId");
CREATE INDEX "WorkoutAssignmentEventLink_participationId_idx" ON "WorkoutAssignmentEventLink"("participationId");
CREATE INDEX "WorkoutAssignmentEventLink_milestoneId_idx" ON "WorkoutAssignmentEventLink"("milestoneId");
ALTER TABLE "WorkoutAssignmentEventLink" ADD CONSTRAINT "WorkoutAssignmentEventLink_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "WorkoutAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignmentEventLink" ADD CONSTRAINT "WorkoutAssignmentEventLink_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "AthleteEventParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignmentEventLink" ADD CONSTRAINT "WorkoutAssignmentEventLink_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "PreparationPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignmentEventLink" ADD CONSTRAINT "WorkoutAssignmentEventLink_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "PreparationMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The coach's decision on a milestone is a review with that target.
ALTER TABLE "CoachReview" ADD COLUMN "preparationMilestoneId" TEXT;
ALTER TABLE "CoachReview" ADD CONSTRAINT "CoachReview_preparationMilestoneId_fkey" FOREIGN KEY ("preparationMilestoneId") REFERENCES "PreparationMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CoachReview_preparationMilestoneId_idx" ON "CoachReview"("preparationMilestoneId");
ALTER TABLE "CoachReview" DROP CONSTRAINT "CoachReview_targetType_check";
ALTER TABLE "CoachReview" ADD CONSTRAINT "CoachReview_targetType_check" CHECK ("targetType" IN ('ASSIGNMENT', 'PREPARATION', 'MILESTONE'));
ALTER TABLE "CoachReview" DROP CONSTRAINT "CoachReview_target_check";
ALTER TABLE "CoachReview" ADD CONSTRAINT "CoachReview_target_check" CHECK (
  ("targetType" = 'ASSIGNMENT' AND "workoutAssignmentId" IS NOT NULL AND "eventPreparationId" IS NULL AND "preparationMilestoneId" IS NULL)
  OR ("targetType" = 'PREPARATION' AND "eventPreparationId" IS NOT NULL AND "workoutAssignmentId" IS NULL AND "preparationMilestoneId" IS NULL)
  OR ("targetType" = 'MILESTONE' AND "preparationMilestoneId" IS NOT NULL AND "eventPreparationId" IS NOT NULL AND "workoutAssignmentId" IS NULL)
);

-- Rollback (manual):
-- DELETE FROM "CoachReview" WHERE "targetType" = 'MILESTONE';
-- restore the two CoachReview CHECKs from 0072; DROP COLUMN "preparationMilestoneId";
-- DROP TABLE "WorkoutAssignmentEventLink"; DROP TABLE "PreparationMilestone"; DROP TABLE "PreparationPhaseRevision"; DROP TABLE "PreparationPhase";