-- SAM-51 — sports events, options, athlete participation and their revisions
-- (§5 of docs/ryvano_treinos_eventos_acompanhamento.md). Additive.

CREATE TABLE "SportEvent" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "edition" VARCHAR(60),
    "type" VARCHAR(30) NOT NULL,
    "sportType" VARCHAR(100) NOT NULL,
    "environment" VARCHAR(30),
    "startLocalDate" VARCHAR(10) NOT NULL,
    "endLocalDate" VARCHAR(10),
    "dateConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMPTZ(3),
    "startTimeStatus" VARCHAR(20) NOT NULL DEFAULT 'TO_BE_CONFIRMED',
    "timeZone" VARCHAR(64) NOT NULL,
    "city" VARCHAR(120),
    "venue" VARCHAR(300),
    "organizer" VARCHAR(200),
    "officialUrl" VARCHAR(500),
    "regulationUrl" VARCHAR(500),
    "regulationConsultedOn" VARCHAR(10),
    "regulationVersion" VARCHAR(60),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
    "origin" VARCHAR(20) NOT NULL,
    "visibility" VARCHAR(10) NOT NULL DEFAULT 'PRIVATE',
    "schoolId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "details" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SportEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SportEvent_type_check" CHECK ("type" IN ('COMPETITION','ORGANIZED_CROSSING','PERSONAL_CHALLENGE','RECREATIONAL','SIMULATION','ASSESSMENT')),
    CONSTRAINT "SportEvent_status_check" CHECK ("status" IN ('PLANNED','CONFIRMED','POSTPONED','CANCELLED')),
    CONSTRAINT "SportEvent_origin_check" CHECK ("origin" IN ('ATHLETE','COACH','SCHOOL','SHARED_CATALOG')),
    CONSTRAINT "SportEvent_visibility_check" CHECK ("visibility" IN ('PRIVATE','SCHOOL','PUBLIC')),
    CONSTRAINT "SportEvent_startTimeStatus_check" CHECK ("startTimeStatus" IN ('CONFIRMED','TO_BE_CONFIRMED')),
    -- A school-visible event names its school.
    CONSTRAINT "SportEvent_school_visibility_check" CHECK ("visibility" <> 'SCHOOL' OR "schoolId" IS NOT NULL),
    CONSTRAINT "SportEvent_dates_check" CHECK ("endLocalDate" IS NULL OR "endLocalDate" >= "startLocalDate")
);
CREATE INDEX "SportEvent_startLocalDate_idx" ON "SportEvent"("startLocalDate");
CREATE INDEX "SportEvent_createdByUserId_idx" ON "SportEvent"("createdByUserId");
CREATE INDEX "SportEvent_visibility_startLocalDate_idx" ON "SportEvent"("visibility", "startLocalDate");
CREATE INDEX "SportEvent_schoolId_startLocalDate_idx" ON "SportEvent"("schoolId", "startLocalDate");
ALTER TABLE "SportEvent" ADD CONSTRAINT "SportEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SportEvent" ADD CONSTRAINT "SportEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SportEventOption" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "distanceValue" DECIMAL(12,3),
    "distanceUnit" VARCHAR(4),
    "segment" VARCHAR(120),
    "position" INTEGER NOT NULL DEFAULT 0,
    "cutoffTotalMinutes" INTEGER,
    "cutoffNotes" VARCHAR(500),
    "courseUrl" VARCHAR(500),
    "elevationGainM" INTEGER,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SportEventOption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SportEventOption_unit_check" CHECK ("distanceUnit" IS NULL OR "distanceUnit" IN ('m','km','yd','mi')),
    CONSTRAINT "SportEventOption_distance_pair_check" CHECK (("distanceValue" IS NULL) = ("distanceUnit" IS NULL))
);
CREATE INDEX "SportEventOption_eventId_position_idx" ON "SportEventOption"("eventId", "position");
ALTER TABLE "SportEventOption" ADD CONSTRAINT "SportEventOption_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SportEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AthleteEventParticipation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "optionId" TEXT,
    "athleteId" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
    "suggestedPriority" VARCHAR(20) NOT NULL,
    "agreedPriority" VARCHAR(20),
    "category" VARCHAR(120),
    "relayRole" VARCHAR(120),
    "goalText" VARCHAR(2000),
    "availabilityUntilEvent" VARCHAR(1000),
    "travelNotes" VARCHAR(1000),
    "registrationProofUrl" VARCHAR(500),
    "needsReviewSince" TIMESTAMPTZ(3),
    "createdByUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AthleteEventParticipation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AthleteEventParticipation_status_check" CHECK ("status" IN ('INTEREST','PLANNED','REGISTERED','CANCELLED','ATTENDED')),
    CONSTRAINT "AthleteEventParticipation_suggested_check" CHECK ("suggestedPriority" IN ('MAIN','SECONDARY','EXPERIENCE')),
    CONSTRAINT "AthleteEventParticipation_agreed_check" CHECK ("agreedPriority" IS NULL OR "agreedPriority" IN ('MAIN','SECONDARY','EXPERIENCE'))
);
CREATE INDEX "AthleteEventParticipation_athleteId_status_idx" ON "AthleteEventParticipation"("athleteId", "status");
CREATE INDEX "AthleteEventParticipation_eventId_idx" ON "AthleteEventParticipation"("eventId");
ALTER TABLE "AthleteEventParticipation" ADD CONSTRAINT "AthleteEventParticipation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SportEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AthleteEventParticipation" ADD CONSTRAINT "AthleteEventParticipation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "SportEventOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AthleteEventParticipation" ADD CONSTRAINT "AthleteEventParticipation_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AthleteEventParticipation" ADD CONSTRAINT "AthleteEventParticipation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SportEventRevision" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" VARCHAR(500),
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SportEventRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SportEventRevision_eventId_changedAt_idx" ON "SportEventRevision"("eventId", "changedAt" DESC);
ALTER TABLE "SportEventRevision" ADD CONSTRAINT "SportEventRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SportEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SportEventRevision" ADD CONSTRAINT "SportEventRevision_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ParticipationRevision" (
    "id" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" VARCHAR(500),
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ParticipationRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ParticipationRevision_participationId_changedAt_idx" ON "ParticipationRevision"("participationId", "changedAt" DESC);
ALTER TABLE "ParticipationRevision" ADD CONSTRAINT "ParticipationRevision_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "AthleteEventParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipationRevision" ADD CONSTRAINT "ParticipationRevision_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback (manual):
-- DROP TABLE "ParticipationRevision"; DROP TABLE "SportEventRevision";
-- DROP TABLE "AthleteEventParticipation"; DROP TABLE "SportEventOption"; DROP TABLE "SportEvent";
