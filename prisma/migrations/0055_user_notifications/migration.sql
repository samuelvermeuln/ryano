-- SAM-29 — in-app notifications.
--
-- One row per user per event, written in the same transaction as the state
-- change it announces. Additive: one enum, one table. Rollback: drop the
-- table, then the type (see architecture/escola-migration-checklist.md).
CREATE TYPE "UserNotificationKind" AS ENUM (
  'SCHOOL_REQUEST_APPROVED', 'SCHOOL_REQUEST_REJECTED',
  'COACH_REQUEST_ACCEPTED', 'COACH_REQUEST_REJECTED',
  'COACH_LEFT_SCHOOL', 'COACH_JOINED_SCHOOL',
  'WORKOUT_REQUEST_DECIDED', 'WORKOUT_CHANGE_DECIDED', 'WORKOUT_REVIEWED',
  'NEW_COACH_ASSIGNMENT_REQUEST', 'NEW_SCHOOL_REQUEST'
);

CREATE TABLE "UserNotification" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "kind"      "UserNotificationKind" NOT NULL,
  "title"     VARCHAR(200) NOT NULL,
  "body"      VARCHAR(1000) NOT NULL,
  "href"      VARCHAR(500),
  "payload"   JSONB,
  "readAt"    TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserNotification_userId_readAt_createdAt_idx"
  ON "UserNotification"("userId", "readAt", "createdAt");

ALTER TABLE "UserNotification"
  ADD CONSTRAINT "UserNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
