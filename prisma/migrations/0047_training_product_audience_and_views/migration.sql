-- Marketplace management surface: private per-athlete products and view counts.
--
-- Purely additive: one new enum VALUE, two new tables. No existing row changes
-- meaning, so this is safe to apply on a live database.

-- PRIVATE is strictly narrower than SCHOOL_ONLY: SCHOOL_ONLY admits every
-- active athlete of the owning school, PRIVATE only the athletes explicitly
-- listed in TrainingProductAudience. Adding a value is additive; every existing
-- product keeps the visibility it already had.
ALTER TYPE "TrainingProductVisibility" ADD VALUE IF NOT EXISTS 'PRIVATE';

-- Allow-list backing visibility = PRIVATE.
CREATE TABLE "TrainingProductAudience" (
    "id"        TEXT           NOT NULL,
    "productId" TEXT           NOT NULL,
    "athleteId" TEXT           NOT NULL,
    "grantedBy" TEXT           NOT NULL,
    "note"      VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TrainingProductAudience_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TrainingProductAudience"
    ADD CONSTRAINT "TrainingProductAudience_revokedAt_after_createdAt_check"
    CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt");

-- Cascade from the product (an audience row is meaningless without it), but
-- Restrict on the people: the module invariant is that ending a relationship
-- never erases who was granted access and by whom.
ALTER TABLE "TrainingProductAudience"
    ADD CONSTRAINT "TrainingProductAudience_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "TrainingProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "TrainingProductAudience_athleteId_fkey"
        FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TrainingProductAudience_grantedBy_fkey"
        FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One row per (product, athlete) forever: re-granting revives the existing row
-- (revokedAt = NULL) instead of appending a duplicate, so "is this athlete
-- allowed right now" is a single-row lookup and can never be ambiguous.
CREATE UNIQUE INDEX "TrainingProductAudience_productId_athleteId_key"
    ON "TrainingProductAudience" ("productId", "athleteId");
CREATE INDEX "TrainingProductAudience_productId_revokedAt_idx"
    ON "TrainingProductAudience" ("productId", "revokedAt");
CREATE INDEX "TrainingProductAudience_athleteId_revokedAt_idx"
    ON "TrainingProductAudience" ("athleteId", "revokedAt");

-- Daily view buckets. No userId column exists by design: a view must never be
-- attributable to a person, which is the same aggregate-only boundary
-- GetProductSalesSummary already enforces for purchases.
CREATE TABLE "TrainingProductViewDaily" (
    "id"        TEXT           NOT NULL,
    "productId" TEXT           NOT NULL,
    "day"       VARCHAR(10)    NOT NULL,
    "views"     INTEGER        NOT NULL DEFAULT 0,
    "anonViews" INTEGER        NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrainingProductViewDaily_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TrainingProductViewDaily"
    ADD CONSTRAINT "TrainingProductViewDaily_counts_check"
    CHECK ("views" >= 0 AND "anonViews" >= 0 AND "anonViews" <= "views");

ALTER TABLE "TrainingProductViewDaily"
    ADD CONSTRAINT "TrainingProductViewDaily_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "TrainingProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The unique key is what makes the counter an idempotent upsert under
-- concurrency: two simultaneous views of the same product on the same day
-- contend on one row instead of inserting two.
CREATE UNIQUE INDEX "TrainingProductViewDaily_productId_day_key"
    ON "TrainingProductViewDaily" ("productId", "day");
CREATE INDEX "TrainingProductViewDaily_productId_day_idx"
    ON "TrainingProductViewDaily" ("productId", "day");

-- Rollback (manual, in reverse order):
--   DROP TABLE IF EXISTS "TrainingProductViewDaily";
--   DROP TABLE IF EXISTS "TrainingProductAudience";
-- The PRIVATE enum value cannot be dropped in PostgreSQL; before rolling back,
-- move any PRIVATE product to SCHOOL_ONLY or DRAFT, otherwise it becomes
-- visible to the whole school. Dropping TrainingProductAudience discards the
-- record of who was granted access — export it first in production.
