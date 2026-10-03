-- SAM-66 — the result of each event option (§5.3, §6 step 13, §12.6, §16.6,
-- AC20, AC25). One result per participation (= per prova/option): finished,
-- did not start, did not finish, disqualified, event cancelled or pending.
-- Official and reported times coexist with their origin; a DNF never erases
-- the effort already recorded (activities stay in the load history).

CREATE TABLE "ParticipationResult" (
  "id"                  TEXT NOT NULL,
  "participationId"     TEXT NOT NULL,
  "athleteId"           TEXT NOT NULL,
  "status"              VARCHAR(20) NOT NULL,
  "officialTimeSeconds" INTEGER,
  "officialTimeSource"  VARCHAR(200),
  "reportedTimeSeconds" INTEGER,
  "reportedByUserId"    TEXT,
  "placement"           VARCHAR(120),
  "category"            VARCHAR(120),
  "splits"              JSONB NOT NULL DEFAULT '[]',
  "abandonSegment"      VARCHAR(120),
  "abandonReason"       VARCHAR(1000),
  "feedingReport"       VARCHAR(1000),
  "strategyExecution"   VARCHAR(2000),
  "dayConditions"       VARCHAR(1000),
  "officialResultUrl"   VARCHAR(500),
  "athletePerception"   VARCHAR(2000),
  "recordedByUserId"    TEXT NOT NULL,
  "version"             INTEGER NOT NULL DEFAULT 1,
  "createdAt"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ParticipationResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParticipationResult_status_check" CHECK ("status" IN ('FINISHED', 'DNS', 'DNF', 'DSQ', 'EVENT_CANCELLED', 'PENDING')),
  CONSTRAINT "ParticipationResult_times_check" CHECK (
    ("officialTimeSeconds" IS NULL OR "officialTimeSeconds" > 0) AND ("reportedTimeSeconds" IS NULL OR "reportedTimeSeconds" > 0)
  ),
  -- A time is only a finishing time when the athlete finished (or was disqualified after finishing).
  CONSTRAINT "ParticipationResult_finish_time_check" CHECK (
    "status" IN ('FINISHED', 'DSQ') OR ("officialTimeSeconds" IS NULL AND "reportedTimeSeconds" IS NULL)
  ),
  CONSTRAINT "ParticipationResult_abandon_check" CHECK ("status" = 'DNF' OR ("abandonSegment" IS NULL AND "abandonReason" IS NULL))
);
CREATE UNIQUE INDEX "ParticipationResult_participationId_key" ON "ParticipationResult"("participationId");
CREATE INDEX "ParticipationResult_athleteId_idx" ON "ParticipationResult"("athleteId");
ALTER TABLE "ParticipationResult" ADD CONSTRAINT "ParticipationResult_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "AthleteEventParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipationResult" ADD CONSTRAINT "ParticipationResult_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipationResult" ADD CONSTRAINT "ParticipationResult_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback (manual):
-- DROP TABLE "ParticipationResult";