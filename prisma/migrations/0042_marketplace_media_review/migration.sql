-- TM009 — MarketplaceMedia + MarketplaceReview (RF-112, spec §5.2/§5.3).
--
-- The `stars` CHECK backstops `CreateMarketplaceReview` (TM047); the unique
-- index is the real safety property (RF-112: "at most one CURRENT review per
-- purchase"), enforced by the database so a race between two requests from
-- the same purchase cannot create two rows.

CREATE TYPE "MarketplaceMediaKind" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "MarketplaceMediaAccess" AS ENUM ('PUBLIC', 'PREVIEW', 'PRIVATE');
CREATE TYPE "MarketplaceMediaProcessingStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

CREATE TABLE "MarketplaceMedia" (
    "id"               TEXT NOT NULL,
    "productId"        TEXT NOT NULL,
    "kind"             "MarketplaceMediaKind" NOT NULL,
    "storageKey"       VARCHAR(500) NOT NULL,
    "thumbnailKey"     VARCHAR(500),
    "altText"          VARCHAR(300) NOT NULL,
    "caption"          VARCHAR(500),
    "sortOrder"        INTEGER NOT NULL DEFAULT 0,
    "access"           "MarketplaceMediaAccess" NOT NULL DEFAULT 'PUBLIC',
    "processingStatus" "MarketplaceMediaProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updatedAt"        TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MarketplaceMedia_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MarketplaceMedia"
    ADD CONSTRAINT "MarketplaceMedia_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "TrainingProduct"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "MarketplaceMedia_productId_access_sortOrder_idx"
    ON "MarketplaceMedia" ("productId", "access", "sortOrder");

CREATE TYPE "MarketplaceReviewModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "MarketplaceReview" (
    "id"               TEXT NOT NULL,
    "productId"        TEXT NOT NULL,
    "purchaseId"       TEXT NOT NULL,
    "athleteId"        TEXT NOT NULL,
    "versionId"        TEXT NOT NULL,
    "stars"            INTEGER NOT NULL,
    "comment"          VARCHAR(2000),
    "moderationStatus" "MarketplaceReviewModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updatedAt"        TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MarketplaceReview"
    ADD CONSTRAINT "MarketplaceReview_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "TrainingProduct"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "MarketplaceReview_purchaseId_fkey"
        FOREIGN KEY ("purchaseId") REFERENCES "TrainingPurchase"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "MarketplaceReview_athleteId_fkey"
        FOREIGN KEY ("athleteId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "MarketplaceReview_versionId_fkey"
        FOREIGN KEY ("versionId") REFERENCES "TrainingProductVersion"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "MarketplaceReview_stars_range_check"
        CHECK ("stars" BETWEEN 1 AND 5);

-- RF-112: at most one CURRENT review per (purchase, athlete, product).
CREATE UNIQUE INDEX "MarketplaceReview_purchase_athlete_product_key"
    ON "MarketplaceReview" ("purchaseId", "athleteId", "productId");

CREATE INDEX "MarketplaceReview_productId_moderationStatus_idx"
    ON "MarketplaceReview" ("productId", "moderationStatus");

-- Rollback (manual, in reverse order):
--   DROP TABLE IF EXISTS "MarketplaceReview";
--   DROP TYPE IF EXISTS "MarketplaceReviewModerationStatus";
--   DROP TABLE IF EXISTS "MarketplaceMedia";
--   DROP TYPE IF EXISTS "MarketplaceMediaProcessingStatus";
--   DROP TYPE IF EXISTS "MarketplaceMediaAccess";
--   DROP TYPE IF EXISTS "MarketplaceMediaKind";
