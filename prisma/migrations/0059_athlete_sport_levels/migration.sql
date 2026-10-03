-- SAM-50 — level per (modality, environment) under the technical sheet (§4 of
-- docs/ryvano_treinos_eventos_acompanhamento.md). Additive: the legacy global
-- `AthleteTechnicalSheet.experienceLevel` stays and is still read as fallback.

CREATE TABLE "AthleteSportLevel" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "sportType" VARCHAR(100) NOT NULL,
    "environment" VARCHAR(30) NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "assessedAt" DATE,
    "assessedByUserId" TEXT,
    "eventExperience" VARCHAR(1000),
    "recentHistory" VARCHAR(1000),
    "currentCondition" VARCHAR(1000),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AthleteSportLevel_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AthleteSportLevel_level_check" CHECK ("level" IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'PROFESSIONAL'))
);

CREATE UNIQUE INDEX "AthleteSportLevel_sheetId_sportType_environment_key" ON "AthleteSportLevel"("sheetId", "sportType", "environment");
CREATE INDEX "AthleteSportLevel_sheetId_idx" ON "AthleteSportLevel"("sheetId");

ALTER TABLE "AthleteSportLevel" ADD CONSTRAINT "AthleteSportLevel_sheetId_fkey"
    FOREIGN KEY ("sheetId") REFERENCES "AthleteTechnicalSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteSportLevel" ADD CONSTRAINT "AthleteSportLevel_assessedByUserId_fkey"
    FOREIGN KEY ("assessedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback (manual): DROP TABLE "AthleteSportLevel";
