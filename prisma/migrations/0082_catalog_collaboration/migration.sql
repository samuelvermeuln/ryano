-- SAM-78 — collaborative institutional catalog (§9.1, §19.4, §20, §26.5, §27.2–27.3).
-- Roles in the school catalog are assigned by OWNER/ADMIN; a coach proposes a
-- personal template, a reviewer publishes it as a COPY with authorship kept;
-- the institutional template stays with the school when its author leaves,
-- the personal one leaves with the coach (decision recorded in the issue).

CREATE TABLE "SchoolCatalogRole" (
  "id"               TEXT NOT NULL,
  "schoolId"         TEXT NOT NULL,
  "coachId"          TEXT NOT NULL,
  "role"             VARCHAR(10) NOT NULL,
  "assignedByUserId" TEXT NOT NULL,
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SchoolCatalogRole_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolCatalogRole_role_check" CHECK ("role" IN ('EDITOR', 'REVIEWER', 'READER'))
);
CREATE UNIQUE INDEX "SchoolCatalogRole_schoolId_coachId_key" ON "SchoolCatalogRole"("schoolId", "coachId");
ALTER TABLE "SchoolCatalogRole" ADD CONSTRAINT "SchoolCatalogRole_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolCatalogRole" ADD CONSTRAINT "SchoolCatalogRole_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkoutTemplateProposal" (
  "id"                  TEXT NOT NULL,
  "schoolId"            TEXT NOT NULL,
  "templateId"          TEXT NOT NULL,
  "templateVersion"     INTEGER NOT NULL,
  "proposedByCoachId"   TEXT NOT NULL,
  "note"                VARCHAR(1000),
  "usageRights"         VARCHAR(300),
  "status"              VARCHAR(10) NOT NULL DEFAULT 'PENDING',
  "reviewNote"          VARCHAR(1000),
  "reviewedByUserId"    TEXT,
  "reviewedAt"          TIMESTAMPTZ(3),
  "publishedTemplateId" TEXT,
  "createdAt"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutTemplateProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkoutTemplateProposal_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'))
);
CREATE INDEX "WorkoutTemplateProposal_schoolId_status_idx" ON "WorkoutTemplateProposal"("schoolId", "status");
CREATE INDEX "WorkoutTemplateProposal_templateId_idx" ON "WorkoutTemplateProposal"("templateId");
ALTER TABLE "WorkoutTemplateProposal" ADD CONSTRAINT "WorkoutTemplateProposal_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutTemplateProposal" ADD CONSTRAINT "WorkoutTemplateProposal_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutTemplateProposal" ADD CONSTRAINT "WorkoutTemplateProposal_proposedByCoachId_fkey" FOREIGN KEY ("proposedByCoachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutTemplateProposal" ADD CONSTRAINT "WorkoutTemplateProposal_publishedTemplateId_fkey" FOREIGN KEY ("publishedTemplateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Where an institutional copy came from, and the rights/origin of the material (§26.5).
ALTER TABLE "WorkoutTemplate" ADD COLUMN "sourceTemplateId" TEXT;
ALTER TABLE "WorkoutTemplate" ADD COLUMN "usageRights" VARCHAR(300);
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback (manual):
-- ALTER TABLE "WorkoutTemplate" DROP CONSTRAINT "WorkoutTemplate_sourceTemplateId_fkey"; ALTER TABLE "WorkoutTemplate" DROP COLUMN "usageRights"; ALTER TABLE "WorkoutTemplate" DROP COLUMN "sourceTemplateId";
-- DROP TABLE "WorkoutTemplateProposal"; DROP TABLE "SchoolCatalogRole";