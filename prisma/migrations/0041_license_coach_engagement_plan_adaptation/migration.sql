-- TM008 — LicenseCoachEngagement + PlanAdaptation (Onda 3 schema).
--
-- design D-05: accepting an engagement is NOT a HistoryAccessGrant — a
-- separate consent. design D-06: PlanAdaptation versions the athlete's
-- INSTANCE, never TrainingProductVersion or another buyer's license.
--
-- `WorkoutAssignment.adaptationVersion` is added here (not in migration 0040)
-- because it exists purely to support PlanAdaptation's optimistic-concurrency
-- check (RNF-003) — it has no meaning without this migration.

ALTER TABLE "WorkoutAssignment"
    ADD COLUMN "adaptationVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "LicenseCoachEngagementStatus" AS ENUM ('PENDING', 'ACTIVE', 'ENDED');

CREATE TABLE "LicenseCoachEngagement" (
    "id"          TEXT NOT NULL,
    "licenseId"   TEXT NOT NULL,
    "athleteId"   TEXT NOT NULL,
    "coachId"     TEXT NOT NULL,
    "schoolId"    TEXT,
    "scope"       JSONB NOT NULL,
    "status"      "LicenseCoachEngagementStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "acceptedAt"  TIMESTAMPTZ(3),
    "endedAt"     TIMESTAMPTZ(3),
    "endReason"   VARCHAR(200),
    "createdAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updatedAt"   TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LicenseCoachEngagement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LicenseCoachEngagement"
    ADD CONSTRAINT "LicenseCoachEngagement_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "TrainingLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "LicenseCoachEngagement_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LicenseCoachEngagement_coachId_fkey"   FOREIGN KEY ("coachId")   REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LicenseCoachEngagement_schoolId_fkey"  FOREIGN KEY ("schoolId")  REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LicenseCoachEngagement_licenseId_status_idx" ON "LicenseCoachEngagement" ("licenseId", "status");
CREATE INDEX "LicenseCoachEngagement_coachId_status_idx"   ON "LicenseCoachEngagement" ("coachId", "status");
CREATE INDEX "LicenseCoachEngagement_athleteId_status_idx" ON "LicenseCoachEngagement" ("athleteId", "status");

-- RF-302: no second pending/active invitation to the SAME coach for the SAME
-- license. A partial index (not a plain UNIQUE) so a coach can be re-invited
-- after a prior engagement ENDED.
CREATE UNIQUE INDEX "LicenseCoachEngagement_license_coach_open_key"
    ON "LicenseCoachEngagement" ("licenseId", "coachId")
    WHERE "status" IN ('PENDING', 'ACTIVE');

CREATE TYPE "PlanAdaptationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "PlanAdaptation" (
    "id"                  TEXT NOT NULL,
    "licenseId"           TEXT NOT NULL,
    "workoutAssignmentId" TEXT NOT NULL,
    "coachId"             TEXT NOT NULL,
    "actorUserId"         TEXT NOT NULL,
    "beforeSnapshot"      JSONB NOT NULL,
    "proposedSnapshot"    JSONB NOT NULL,
    "reason"              VARCHAR(1000) NOT NULL,
    "status"              "PlanAdaptationStatus" NOT NULL DEFAULT 'PENDING',
    "expectedVersion"     INTEGER NOT NULL,
    "acceptedByAthleteAt" TIMESTAMPTZ(3),
    "createdAt"           TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updatedAt"           TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlanAdaptation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlanAdaptation"
    ADD CONSTRAINT "PlanAdaptation_licenseId_fkey"           FOREIGN KEY ("licenseId")           REFERENCES "TrainingLicense"("id")    ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "PlanAdaptation_workoutAssignmentId_fkey" FOREIGN KEY ("workoutAssignmentId") REFERENCES "WorkoutAssignment"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "PlanAdaptation_coachId_fkey"              FOREIGN KEY ("coachId")              REFERENCES "CoachProfile"("id")      ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PlanAdaptation_actorUserId_fkey"          FOREIGN KEY ("actorUserId")          REFERENCES "User"("id")              ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "PlanAdaptation_licenseId_status_idx" ON "PlanAdaptation" ("licenseId", "status");
CREATE INDEX "PlanAdaptation_workoutAssignmentId_status_idx" ON "PlanAdaptation" ("workoutAssignmentId", "status");

-- Rollback (manual, in reverse order):
--   DROP TABLE IF EXISTS "PlanAdaptation";
--   DROP TYPE IF EXISTS "PlanAdaptationStatus";
--   DROP TABLE IF EXISTS "LicenseCoachEngagement";
--   DROP TYPE IF EXISTS "LicenseCoachEngagementStatus";
--   ALTER TABLE "WorkoutAssignment" DROP COLUMN IF EXISTS "adaptationVersion";
