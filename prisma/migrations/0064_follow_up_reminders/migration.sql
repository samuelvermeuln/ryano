-- SAM-56 — deadlines/reminders policy, scheduled reminders and quiet hours
-- (§7.2–7.3, §21.4–21.5, AC20). Additive.

ALTER TABLE "NotificationPreference" ADD COLUMN "quietHoursStart" VARCHAR(5);
ALTER TABLE "NotificationPreference" ADD COLUMN "quietHoursEnd" VARCHAR(5);

CREATE TABLE "FollowUpPolicy" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "coachId" TEXT,
    "firstAnalysisBusinessDays" INTEGER NOT NULL DEFAULT 2,
    "reminderDaysBefore" INTEGER[] DEFAULT ARRAY[30, 14, 7, 1]::INTEGER[],
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "timeZone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
    "notifyCoordinationOnOverdue" BOOLEAN NOT NULL DEFAULT false,
    "milestoneNotifyAthlete" BOOLEAN NOT NULL DEFAULT true,
    "milestoneNotifyCoach" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FollowUpPolicy_pkey" PRIMARY KEY ("id"),
    -- Exactly one owner: a school or an independent coach.
    CONSTRAINT "FollowUpPolicy_owner_check" CHECK (("schoolId" IS NULL) <> ("coachId" IS NULL)),
    CONSTRAINT "FollowUpPolicy_business_days_check" CHECK ("firstAnalysisBusinessDays" BETWEEN 0 AND 30)
);
CREATE UNIQUE INDEX "FollowUpPolicy_schoolId_key" ON "FollowUpPolicy"("schoolId");
CREATE UNIQUE INDEX "FollowUpPolicy_coachId_key" ON "FollowUpPolicy"("coachId");
ALTER TABLE "FollowUpPolicy" ADD CONSTRAINT "FollowUpPolicy_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpPolicy" ADD CONSTRAINT "FollowUpPolicy_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ScheduledReminder" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "sourceType" VARCHAR(40) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "audience" VARCHAR(20) NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(500),
    "sentAt" TIMESTAMPTZ(3),
    "dedupeKey" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ScheduledReminder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduledReminder_status_check" CHECK ("status" IN ('PENDING','SENT','CANCELLED','SKIPPED')),
    CONSTRAINT "ScheduledReminder_audience_check" CHECK ("audience" IN ('ATHLETE','RESPONSIBLE','COORDINATION'))
);
CREATE UNIQUE INDEX "ScheduledReminder_dedupeKey_key" ON "ScheduledReminder"("dedupeKey");
CREATE INDEX "ScheduledReminder_status_dueAt_idx" ON "ScheduledReminder"("status", "dueAt");
CREATE INDEX "ScheduledReminder_sourceType_sourceId_idx" ON "ScheduledReminder"("sourceType", "sourceId");
ALTER TABLE "ScheduledReminder" ADD CONSTRAINT "ScheduledReminder_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback (manual):
-- DROP TABLE "ScheduledReminder"; DROP TABLE "FollowUpPolicy";
-- ALTER TABLE "NotificationPreference" DROP COLUMN "quietHoursEnd", DROP COLUMN "quietHoursStart";
