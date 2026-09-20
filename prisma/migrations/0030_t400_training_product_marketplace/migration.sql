-- T400–T403: TrainingProduct marketplace models
-- Adds: enums, TrainingProduct, TrainingProductVersion, TrainingPurchase, TrainingLicense

-- Enums

CREATE TYPE "TrainingProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "TrainingProductVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'SCHOOL_ONLY');
CREATE TYPE "TrainingPurchaseStatus" AS ENUM ('PENDING', 'COMPLETED', 'REFUNDED', 'CANCELLED');
CREATE TYPE "TrainingLicenseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- TrainingProduct (T400)

CREATE TABLE "TrainingProduct" (
    "id"               TEXT NOT NULL,
    "schoolId"         TEXT,
    "coachId"          TEXT,
    "title"            VARCHAR(200) NOT NULL,
    "description"      TEXT,
    "sportType"        VARCHAR(100),
    "durationWeeks"    INTEGER,
    "status"           "TrainingProductStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility"       "TrainingProductVisibility" NOT NULL DEFAULT 'PUBLIC',
    "priceCents"       INTEGER,
    "currency"         VARCHAR(3),
    "currentVersionId" TEXT,
    "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrainingProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingProduct_currentVersionId_key" ON "TrainingProduct"("currentVersionId");
CREATE INDEX "TrainingProduct_schoolId_status_idx"   ON "TrainingProduct"("schoolId", "status");
CREATE INDEX "TrainingProduct_coachId_status_idx"    ON "TrainingProduct"("coachId", "status");
CREATE INDEX "TrainingProduct_status_visibility_idx" ON "TrainingProduct"("status", "visibility");

-- TrainingProductVersion (T401)

CREATE TABLE "TrainingProductVersion" (
    "id"            TEXT NOT NULL,
    "productId"     TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "planPayload"   JSONB NOT NULL,
    "changeNote"    VARCHAR(1000),
    "publishedAt"   TIMESTAMPTZ(3),
    "createdAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingProductVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingProductVersion_productId_versionNumber_key"
    ON "TrainingProductVersion"("productId", "versionNumber");
CREATE INDEX "TrainingProductVersion_productId_publishedAt_idx"
    ON "TrainingProductVersion"("productId", "publishedAt" DESC);

-- TrainingPurchase (T402)

CREATE TABLE "TrainingPurchase" (
    "id"          TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "athleteId"   TEXT NOT NULL,
    "paymentRef"  VARCHAR(500),
    "pricePaid"   INTEGER,
    "currency"    VARCHAR(3),
    "status"      "TrainingPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "purchasedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrainingPurchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingPurchase_athleteId_purchasedAt_idx" ON "TrainingPurchase"("athleteId", "purchasedAt" DESC);
CREATE INDEX "TrainingPurchase_productId_status_idx"       ON "TrainingPurchase"("productId", "status");

-- TrainingLicense (T403)

CREATE TABLE "TrainingLicense" (
    "id"                   TEXT NOT NULL,
    "productId"            TEXT NOT NULL,
    "versionId"            TEXT NOT NULL,
    "purchaseId"           TEXT,
    "athleteId"            TEXT NOT NULL,
    "status"               "TrainingLicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt"            TIMESTAMPTZ(3),
    "expiresAt"            TIMESTAMPTZ(3),
    "revokedAt"            TIMESTAMPTZ(3),
    "calendarInstantiated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"            TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrainingLicense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingLicense_athleteId_status_idx"  ON "TrainingLicense"("athleteId", "status");
CREATE INDEX "TrainingLicense_productId_status_idx"  ON "TrainingLicense"("productId", "status");
CREATE INDEX "TrainingLicense_purchaseId_idx"        ON "TrainingLicense"("purchaseId");

-- Foreign keys

ALTER TABLE "TrainingProduct"
    ADD CONSTRAINT "TrainingProduct_schoolId_fkey"
        FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TrainingProduct_coachId_fkey"
        FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TrainingProduct_currentVersionId_fkey"
        FOREIGN KEY ("currentVersionId") REFERENCES "TrainingProductVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrainingProductVersion"
    ADD CONSTRAINT "TrainingProductVersion_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "TrainingProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingPurchase"
    ADD CONSTRAINT "TrainingPurchase_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "TrainingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TrainingPurchase_athleteId_fkey"
        FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TrainingLicense"
    ADD CONSTRAINT "TrainingLicense_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "TrainingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TrainingLicense_versionId_fkey"
        FOREIGN KEY ("versionId") REFERENCES "TrainingProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TrainingLicense_purchaseId_fkey"
        FOREIGN KEY ("purchaseId") REFERENCES "TrainingPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "TrainingLicense_athleteId_fkey"
        FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
