-- SAM-53 — structured goals: desired by the athlete × agreed with the coach,
-- with append-only revisions (§5.4, §8.4). Additive.

CREATE TABLE "AthleteGoal" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "participationId" TEXT,
    "type" VARCHAR(20) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "indicator" VARCHAR(120),
    "unit" VARCHAR(20),
    "baselineValue" DECIMAL(14,3),
    "targetValue" DECIMAL(14,3),
    "targetMin" DECIMAL(14,3),
    "targetMax" DECIMAL(14,3),
    "dueLocalDate" VARCHAR(10),
    "evaluationMethod" VARCHAR(500),
    "acceptedEvidence" VARCHAR(500),
    "responsibleUserId" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "statusReason" VARCHAR(500),
    "origin" VARCHAR(20) NOT NULL,
    "desiredGoalId" TEXT,
    "needsReviewSince" TIMESTAMPTZ(3),
    "createdByUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AthleteGoal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AthleteGoal_type_check" CHECK ("type" IN ('RESULT','PERFORMANCE','PROCESS','PREPARATION')),
    CONSTRAINT "AthleteGoal_status_check" CHECK ("status" IN ('ACTIVE','ACHIEVED','PARTIALLY_ACHIEVED','NOT_ACHIEVED','CANCELLED','REPLACED')),
    CONSTRAINT "AthleteGoal_origin_check" CHECK ("origin" IN ('ATHLETE_DESIRED','COACH_AGREED')),
    -- Only an agreed goal answers a wish.
    CONSTRAINT "AthleteGoal_desired_link_check" CHECK ("desiredGoalId" IS NULL OR "origin" = 'COACH_AGREED'),
    CONSTRAINT "AthleteGoal_range_check" CHECK ("targetMin" IS NULL OR "targetMax" IS NULL OR "targetMin" <= "targetMax")
);
CREATE INDEX "AthleteGoal_athleteId_status_idx" ON "AthleteGoal"("athleteId", "status");
CREATE INDEX "AthleteGoal_participationId_idx" ON "AthleteGoal"("participationId");
CREATE INDEX "AthleteGoal_desiredGoalId_idx" ON "AthleteGoal"("desiredGoalId");
ALTER TABLE "AthleteGoal" ADD CONSTRAINT "AthleteGoal_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AthleteGoal" ADD CONSTRAINT "AthleteGoal_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "AthleteEventParticipation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AthleteGoal" ADD CONSTRAINT "AthleteGoal_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AthleteGoal" ADD CONSTRAINT "AthleteGoal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AthleteGoal" ADD CONSTRAINT "AthleteGoal_desiredGoalId_fkey" FOREIGN KEY ("desiredGoalId") REFERENCES "AthleteGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AthleteGoalRevision" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" VARCHAR(500),
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AthleteGoalRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AthleteGoalRevision_goalId_changedAt_idx" ON "AthleteGoalRevision"("goalId", "changedAt" DESC);
ALTER TABLE "AthleteGoalRevision" ADD CONSTRAINT "AthleteGoalRevision_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "AthleteGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteGoalRevision" ADD CONSTRAINT "AthleteGoalRevision_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback (manual): DROP TABLE "AthleteGoalRevision"; DROP TABLE "AthleteGoal";
