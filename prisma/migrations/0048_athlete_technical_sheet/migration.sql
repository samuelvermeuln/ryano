-- SAM-11 — AthleteTechnicalSheet: the training parameters a coach needs in
-- order to prescribe (zones, thresholds, FTP, CSS, goals, availability,
-- equipment, declared restrictions), scoped to one athlete inside one school.
--
-- Purely additive: one new table, no change to any existing row or column, so
-- this is safe to apply on a live database.
--
-- Why not extra columns on "UserProfile": that table is the person's own global
-- account data. These are coaching parameters of the school–athlete
-- relationship — two schools may legitimately hold different threshold paces
-- for the same athlete, and an athlete leaving a school must not carry that
-- school's assessment away. Scoping by (schoolId, athleteId) also puts these
-- rows under the same multi-tenant isolation as the rest of the module.
--
-- "restrictions" holds limitations a professional wrote down. It is not a
-- medical diagnosis and nothing derives one from it.

CREATE TABLE "AthleteTechnicalSheet" (
    "id"                    TEXT           NOT NULL,
    "schoolId"              TEXT           NOT NULL,
    "athleteId"             TEXT           NOT NULL,
    -- Canonical RyvanoSportType values; empty array = no modality declared yet.
    "sportTypes"            TEXT[]         NOT NULL DEFAULT ARRAY[]::TEXT[],
    "experienceLevel"       VARCHAR(20),
    "goals"                 VARCHAR(2000),
    "targetEvent"           VARCHAR(300),
    "targetEventDate"       DATE,
    "availability"          VARCHAR(1000),
    "equipment"             VARCHAR(1000),
    "restrictions"          VARCHAR(2000),
    "maxHeartRate"          INTEGER,
    "thresholdHeartRate"    INTEGER,
    "restingHeartRate"      INTEGER,
    "thresholdPaceSecPerKm" INTEGER,
    "ftpWatts"              INTEGER,
    "cssSecPer100m"         INTEGER,
    "notes"                 VARCHAR(2000),
    "updatedByUserId"       TEXT,
    "createdAt"             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AthleteTechnicalSheet_pkey" PRIMARY KEY ("id")
);

-- One sheet per athlete per school: the screen edits a single row, and a second
-- one would silently split the parameters the prescription reads from.
CREATE UNIQUE INDEX "AthleteTechnicalSheet_schoolId_athleteId_key"
    ON "AthleteTechnicalSheet" ("schoolId", "athleteId");

-- "Every sheet this athlete has", used when an athlete's own screens or a
-- second school context need to be resolved without scanning by school.
CREATE INDEX "AthleteTechnicalSheet_athleteId_idx"
    ON "AthleteTechnicalSheet" ("athleteId");

-- The same bounds the domain entity enforces, repeated here because the
-- database is the last line of defence. They reject typos (an FTP of 40 000 W,
-- a threshold pace of zero) without pretending to encode physiology.
ALTER TABLE "AthleteTechnicalSheet"
    ADD CONSTRAINT "AthleteTechnicalSheet_experienceLevel_check" CHECK (
        "experienceLevel" IS NULL
        OR "experienceLevel" IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ELITE')
    ),
    ADD CONSTRAINT "AthleteTechnicalSheet_maxHeartRate_check"
        CHECK ("maxHeartRate" IS NULL OR "maxHeartRate" BETWEEN 60 AND 260),
    ADD CONSTRAINT "AthleteTechnicalSheet_thresholdHeartRate_check"
        CHECK ("thresholdHeartRate" IS NULL OR "thresholdHeartRate" BETWEEN 60 AND 260),
    ADD CONSTRAINT "AthleteTechnicalSheet_restingHeartRate_check"
        CHECK ("restingHeartRate" IS NULL OR "restingHeartRate" BETWEEN 20 AND 150),
    ADD CONSTRAINT "AthleteTechnicalSheet_thresholdPace_check"
        CHECK ("thresholdPaceSecPerKm" IS NULL OR "thresholdPaceSecPerKm" BETWEEN 120 AND 1800),
    ADD CONSTRAINT "AthleteTechnicalSheet_ftpWatts_check"
        CHECK ("ftpWatts" IS NULL OR "ftpWatts" BETWEEN 30 AND 2000),
    ADD CONSTRAINT "AthleteTechnicalSheet_cssSecPer100m_check"
        CHECK ("cssSecPer100m" IS NULL OR "cssSecPer100m" BETWEEN 40 AND 600);

-- The three heart rates have to be orderable; a threshold above maximum is a
-- data-entry error, not a physiological finding.
ALTER TABLE "AthleteTechnicalSheet"
    ADD CONSTRAINT "AthleteTechnicalSheet_heartRate_order_check" CHECK (
        (
            "maxHeartRate" IS NULL OR "thresholdHeartRate" IS NULL
            OR "thresholdHeartRate" <= "maxHeartRate"
        )
        AND (
            "maxHeartRate" IS NULL OR "restingHeartRate" IS NULL
            OR "restingHeartRate" < "maxHeartRate"
        )
    );

ALTER TABLE "AthleteTechnicalSheet"
    ADD CONSTRAINT "AthleteTechnicalSheet_updatedAt_after_createdAt_check"
    CHECK ("updatedAt" >= "createdAt");

-- Restrict everywhere, matching the module invariant that ending a
-- relationship never deletes history.
ALTER TABLE "AthleteTechnicalSheet"
    ADD CONSTRAINT "AthleteTechnicalSheet_schoolId_fkey"
        FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "AthleteTechnicalSheet_athleteId_fkey"
        FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "AthleteTechnicalSheet_updatedByUserId_fkey"
        FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback (manual):
--   DROP TABLE IF EXISTS "AthleteTechnicalSheet";
-- Dropping the table discards every zone, threshold and declared restriction
-- the coaches recorded; export before rolling back in production.
