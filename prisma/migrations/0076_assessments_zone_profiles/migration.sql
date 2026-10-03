-- SAM-70 — assessments with protocol and versioned coach zone profiles
-- (§18.1, §18.2, §18.4, AC14). The default stays the derived 5-zone table;
-- a profile is the coach's configuration (not athlete data), immutable per
-- version. Promoting an assessment to the sheet is explicit and leaves the
-- trail (revision.assessmentId); published prescriptions keep their values.

CREATE TABLE "AthleteAssessment" (
  "id"                  TEXT NOT NULL,
  "athleteId"           TEXT NOT NULL,
  "schoolId"            TEXT,
  "coachId"             TEXT,
  "sportType"           VARCHAR(100) NOT NULL,
  "environment"         VARCHAR(30),
  "assessedLocalDate"   VARCHAR(10) NOT NULL,
  "protocol"            VARCHAR(300) NOT NULL,
  "protocolCode"        VARCHAR(60),
  "assessorName"        VARCHAR(200),
  "reference"           VARCHAR(20) NOT NULL,
  "resultValue"         DECIMAL(12, 3) NOT NULL,
  "resultUnit"          VARCHAR(20) NOT NULL,
  "conditions"          VARCHAR(1000),
  "source"              VARCHAR(20) NOT NULL,
  "sourceDetail"        VARCHAR(200),
  "limitations"         VARCHAR(1000),
  "nextReviewLocalDate" VARCHAR(10),
  "promotedAt"          TIMESTAMPTZ(3),
  "createdByUserId"     TEXT NOT NULL,
  "createdAt"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AthleteAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AthleteAssessment_scope_check" CHECK ("schoolId" IS NOT NULL OR "coachId" IS NOT NULL),
  CONSTRAINT "AthleteAssessment_reference_check" CHECK ("reference" IN ('FTP', 'CSS', 'THRESHOLD_PACE', 'THRESHOLD_HR', 'MAX_HR', 'RESTING_HR', 'OTHER')),
  CONSTRAINT "AthleteAssessment_source_check" CHECK ("source" IN ('IN_PERSON', 'DEVICE', 'ESTIMATE'))
);
CREATE INDEX "AthleteAssessment_athleteId_assessedLocalDate_idx" ON "AthleteAssessment"("athleteId", "assessedLocalDate");
ALTER TABLE "AthleteAssessment" ADD CONSTRAINT "AthleteAssessment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteAssessment" ADD CONSTRAINT "AthleteAssessment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ZoneProfile" (
  "id"             TEXT NOT NULL,
  "ownerCoachId"   TEXT NOT NULL,
  "name"           VARCHAR(120) NOT NULL,
  "family"         VARCHAR(20) NOT NULL,
  "reference"      VARCHAR(20) NOT NULL,
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "archivedAt"     TIMESTAMPTZ(3),
  "createdAt"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ZoneProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ZoneProfile_family_check" CHECK ("family" IN ('heartRate', 'pace', 'swim', 'power')),
  CONSTRAINT "ZoneProfile_reference_check" CHECK ("reference" IN ('MAX_HR', 'HRR', 'LTHR', 'THRESHOLD_PACE', 'CSS', 'FTP'))
);
CREATE INDEX "ZoneProfile_ownerCoachId_idx" ON "ZoneProfile"("ownerCoachId");
ALTER TABLE "ZoneProfile" ADD CONSTRAINT "ZoneProfile_ownerCoachId_fkey" FOREIGN KEY ("ownerCoachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ZoneProfileVersion" (
  "id"              TEXT NOT NULL,
  "profileId"       TEXT NOT NULL,
  "version"         INTEGER NOT NULL,
  "method"          VARCHAR(200) NOT NULL,
  "bounds"          JSONB NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZoneProfileVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ZoneProfileVersion_profileId_version_key" ON "ZoneProfileVersion"("profileId", "version");
ALTER TABLE "ZoneProfileVersion" ADD CONSTRAINT "ZoneProfileVersion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ZoneProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Which profile version each zone family of the athlete uses ({family: versionId}); absent = derived default.
ALTER TABLE "AthleteTechnicalSheet" ADD COLUMN "zoneProfileVersions" JSONB;
-- A parameter change promoted from an assessment points back at it.
ALTER TABLE "AthleteTechnicalSheetRevision" ADD COLUMN "assessmentId" TEXT;
ALTER TABLE "AthleteTechnicalSheetRevision" ADD CONSTRAINT "AthleteTechnicalSheetRevision_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "AthleteAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback (manual):
-- ALTER TABLE "AthleteTechnicalSheetRevision" DROP CONSTRAINT "AthleteTechnicalSheetRevision_assessmentId_fkey";
-- ALTER TABLE "AthleteTechnicalSheetRevision" DROP COLUMN "assessmentId";
-- ALTER TABLE "AthleteTechnicalSheet" DROP COLUMN "zoneProfileVersions";
-- DROP TABLE "ZoneProfileVersion"; DROP TABLE "ZoneProfile"; DROP TABLE "AthleteAssessment";