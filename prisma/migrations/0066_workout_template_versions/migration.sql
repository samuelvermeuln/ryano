-- SAM-58 — versioned, immutable template content; catalog classification,
-- variants, favourites and free-text search (§9, AC05, AC08). Additive.

ALTER TABLE "WorkoutTemplate" ADD COLUMN "code" VARCHAR(40);
ALTER TABLE "WorkoutTemplate" ADD COLUMN "contentKind" VARCHAR(20) NOT NULL DEFAULT 'SESSION';
ALTER TABLE "WorkoutTemplate" ADD COLUMN "environment" VARCHAR(30);
ALTER TABLE "WorkoutTemplate" ADD COLUMN "sessionType" VARCHAR(80);
ALTER TABLE "WorkoutTemplate" ADD COLUMN "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WorkoutTemplate" ADD COLUMN "level" VARCHAR(20);
ALTER TABLE "WorkoutTemplate" ADD COLUMN "phase" VARCHAR(80);
ALTER TABLE "WorkoutTemplate" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WorkoutTemplate" ADD COLUMN "folder" VARCHAR(80);
ALTER TABLE "WorkoutTemplate" ADD COLUMN "parentTemplateId" TEXT;
ALTER TABLE "WorkoutTemplate" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkoutTemplate" ADD COLUMN "archivedAt" TIMESTAMPTZ(3);
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_contentKind_check" CHECK ("contentKind" IN ('EXERCISE','SESSION','PLAN'));
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_parentTemplateId_fkey" FOREIGN KEY ("parentTemplateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WorkoutTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkoutTemplateVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkoutTemplateVersion_templateId_number_key" ON "WorkoutTemplateVersion"("templateId", "number");
ALTER TABLE "WorkoutTemplateVersion" ADD CONSTRAINT "WorkoutTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutTemplateVersion" ADD CONSTRAINT "WorkoutTemplateVersion_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WorkoutTemplateFavorite" (
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkoutTemplateFavorite_pkey" PRIMARY KEY ("userId", "templateId")
);
ALTER TABLE "WorkoutTemplateFavorite" ADD CONSTRAINT "WorkoutTemplateFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutTemplateFavorite" ADD CONSTRAINT "WorkoutTemplateFavorite_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing templates had no content: their current number becomes an empty,
-- immutable version authored by the template's coach (when known), so every
-- template has the version its `version` column points at.
INSERT INTO "WorkoutTemplateVersion" ("id", "templateId", "number", "schemaVersion", "content", "summary", "authorUserId", "createdAt")
SELECT 'tv_' || t."id" || '_' || t."version", t."id", t."version", 1,
       '{"blocks": []}'::jsonb,
       '{"durationSeconds": null, "distanceMeters": null, "durationIsPartial": false, "distanceIsPartial": false}'::jsonb,
       c."userId", t."createdAt"
FROM "WorkoutTemplate" t
JOIN "CoachProfile" c ON c."id" = t."authorCoachId";

UPDATE "WorkoutTemplate" SET "searchText" = lower("title"), "archivedAt" = CASE WHEN "status" = 'ARCHIVED' THEN "updatedAt" ELSE NULL END;

-- Rollback (manual):
-- DROP TABLE "WorkoutTemplateFavorite"; DROP TABLE "WorkoutTemplateVersion";
-- ALTER TABLE "WorkoutTemplate" DROP CONSTRAINT "WorkoutTemplate_parentTemplateId_fkey", DROP CONSTRAINT "WorkoutTemplate_contentKind_check",
--   DROP COLUMN "archivedAt", DROP COLUMN "searchText", DROP COLUMN "parentTemplateId", DROP COLUMN "folder", DROP COLUMN "tags",
--   DROP COLUMN "phase", DROP COLUMN "level", DROP COLUMN "capabilities", DROP COLUMN "sessionType", DROP COLUMN "environment",
--   DROP COLUMN "contentKind", DROP COLUMN "code";
