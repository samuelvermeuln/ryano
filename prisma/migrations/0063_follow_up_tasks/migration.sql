-- SAM-55 — trigger kinds of §7.1, idempotent notifications and operational
-- follow-up tasks with state and history (§7.1–7.3, AC02). Additive.

ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'EVENT_REGISTERED';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'EVENT_CHANGED';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'EVENT_CANCELLED_OR_POSTPONED';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'PREPARATION_UNASSIGNED';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'FIRST_ANALYSIS_OVERDUE';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'MILESTONE_APPROACHING';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'MILESTONE_EVIDENCE_RECEIVED';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'SESSION_WITHOUT_RECORD';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'UNPLANNED_ACTIVITY';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'DEVIATION_DETECTED';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'FEEDBACK_PAIN_REPORTED';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'EVENT_APPROACHING';
ALTER TYPE "UserNotificationKind" ADD VALUE IF NOT EXISTS 'EVENT_RESULT_MISSING';

ALTER TABLE "UserNotification" ADD COLUMN "dedupeKey" VARCHAR(200);
-- NULL keys stay distinct, so notifications without a key are unaffected.
CREATE UNIQUE INDEX "UserNotification_userId_dedupeKey_key" ON "UserNotification"("userId", "dedupeKey");

CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "sourceType" VARCHAR(40) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "schoolId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "href" VARCHAR(500),
    "dueAt" TIMESTAMPTZ(3),
    "priority" VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
    "status" VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "rescheduledTo" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "dedupeKey" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FollowUpTask_priority_check" CHECK ("priority" IN ('LOW','NORMAL','HIGH')),
    CONSTRAINT "FollowUpTask_status_check" CHECK ("status" IN ('NEW','SEEN','IN_PROGRESS','RESOLVED','RESCHEDULED','CANCELLED')),
    -- Someone owns it: a user or a school's coordination queue.
    CONSTRAINT "FollowUpTask_owner_check" CHECK ("assigneeUserId" IS NOT NULL OR "schoolId" IS NOT NULL),
    CONSTRAINT "FollowUpTask_rescheduled_check" CHECK ("status" <> 'RESCHEDULED' OR "rescheduledTo" IS NOT NULL)
);
CREATE UNIQUE INDEX "FollowUpTask_dedupeKey_key" ON "FollowUpTask"("dedupeKey");
CREATE INDEX "FollowUpTask_assigneeUserId_status_idx" ON "FollowUpTask"("assigneeUserId", "status");
CREATE INDEX "FollowUpTask_schoolId_status_idx" ON "FollowUpTask"("schoolId", "status");
CREATE INDEX "FollowUpTask_sourceType_sourceId_idx" ON "FollowUpTask"("sourceType", "sourceId");
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FollowUpTaskTransition" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromStatus" VARCHAR(20),
    "toStatus" VARCHAR(20) NOT NULL,
    "actorUserId" TEXT,
    "reason" VARCHAR(500),
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpTaskTransition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FollowUpTaskTransition_taskId_at_idx" ON "FollowUpTaskTransition"("taskId", "at");
ALTER TABLE "FollowUpTaskTransition" ADD CONSTRAINT "FollowUpTaskTransition_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "FollowUpTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpTaskTransition" ADD CONSTRAINT "FollowUpTaskTransition_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback (manual; enum values cannot be dropped, leaving them is harmless):
-- DROP TABLE "FollowUpTaskTransition"; DROP TABLE "FollowUpTask";
-- DROP INDEX "UserNotification_userId_dedupeKey_key"; ALTER TABLE "UserNotification" DROP COLUMN "dedupeKey";
