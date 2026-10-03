-- SAM-54 — coach follow-up of a participation and its transitions (§6, §6.1). Additive.

CREATE TABLE "EventPreparation" (
    "id" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "coachId" TEXT,
    "schoolId" TEXT,
    "status" VARCHAR(20) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "firstReviewLocalDate" VARCHAR(10),
    "analysisNotes" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "EventPreparation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventPreparation_status_check" CHECK ("status" IN ('UNASSIGNED','AWAITING_ASSESSMENT','PLANNING','ACTIVE','REVIEW_PENDING','PAUSED','CLOSED')),
    -- Without a responsible the state is UNASSIGNED (or CLOSED); with one it never is UNASSIGNED.
    CONSTRAINT "EventPreparation_responsible_check" CHECK (("coachId" IS NULL AND "status" IN ('UNASSIGNED','CLOSED')) OR ("coachId" IS NOT NULL AND "status" <> 'UNASSIGNED'))
);
CREATE UNIQUE INDEX "EventPreparation_participationId_key" ON "EventPreparation"("participationId");
CREATE INDEX "EventPreparation_coachId_status_idx" ON "EventPreparation"("coachId", "status");
CREATE INDEX "EventPreparation_schoolId_status_idx" ON "EventPreparation"("schoolId", "status");
ALTER TABLE "EventPreparation" ADD CONSTRAINT "EventPreparation_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "AthleteEventParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventPreparation" ADD CONSTRAINT "EventPreparation_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventPreparation" ADD CONSTRAINT "EventPreparation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EventPreparationTransition" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "fromStatus" VARCHAR(20),
    "toStatus" VARCHAR(20) NOT NULL,
    "fromCoachId" TEXT,
    "toCoachId" TEXT,
    "actorUserId" TEXT,
    "reason" VARCHAR(500),
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventPreparationTransition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventPreparationTransition_preparationId_at_idx" ON "EventPreparationTransition"("preparationId", "at");
ALTER TABLE "EventPreparationTransition" ADD CONSTRAINT "EventPreparationTransition_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "EventPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventPreparationTransition" ADD CONSTRAINT "EventPreparationTransition_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing participations (created before this migration) get their administrative record.
INSERT INTO "EventPreparation" ("id", "participationId", "coachId", "schoolId", "status", "createdAt", "updatedAt")
SELECT 'prep_' || p."id", p."id", NULL, NULL,
       CASE WHEN p."status" = 'CANCELLED' THEN 'CLOSED' ELSE 'UNASSIGNED' END,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AthleteEventParticipation" p
WHERE NOT EXISTS (SELECT 1 FROM "EventPreparation" e WHERE e."participationId" = p."id");

-- Rollback (manual): DROP TABLE "EventPreparationTransition"; DROP TABLE "EventPreparation";
