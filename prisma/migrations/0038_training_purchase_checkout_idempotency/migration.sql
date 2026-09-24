-- TM005 — TrainingPurchase: real checkout, offer freezing, webhook idempotency.
--
-- RF-201 (checkout revalidates and freezes price/version on the server),
-- RF-202/RF-203 (a purchase can only be promoted to COMPLETED by a verified
-- provider event, never by a client-supplied paymentRef, and a repeated
-- webhook must not create a second license).
--
-- `versionId` is nullable because it references TrainingProductVersion,
-- which did not exist as a purchase-time concept before this migration —
-- existing rows keep versionId=NULL, which is fine since only the checkout
-- path from TM058+ ever populates it.
--
-- Two unicity guarantees:
--   * (checkoutId) — a single checkout attempt cannot be recorded twice.
--   * (provider, providerEventId) — the exact defense against duplicate
--     webhook delivery (RF-203). Both columns nullable: Postgres does not
--     collide NULL with NULL in a composite unique index, so rows with no
--     provider event (the free-acquisition path) never spuriously conflict.

ALTER TABLE "TrainingPurchase"
    ADD COLUMN "versionId"        TEXT,
    ADD COLUMN "offerSnapshot"    JSONB,
    ADD COLUMN "checkoutId"       VARCHAR(200),
    ADD COLUMN "provider"         VARCHAR(50),
    ADD COLUMN "providerEventId"  VARCHAR(200),
    ADD COLUMN "idempotencyKey"   VARCHAR(200),
    ADD COLUMN "confirmedAt"      TIMESTAMPTZ(3),
    ADD COLUMN "refundReason"     VARCHAR(500);

ALTER TABLE "TrainingPurchase"
    ADD CONSTRAINT "TrainingPurchase_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "TrainingProductVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "TrainingPurchase_checkoutId_key"
    ON "TrainingPurchase" ("checkoutId");

CREATE UNIQUE INDEX IF NOT EXISTS "TrainingPurchase_provider_providerEventId_key"
    ON "TrainingPurchase" ("provider", "providerEventId");

-- Rollback (manual, in reverse order):
--   DROP INDEX IF EXISTS "TrainingPurchase_provider_providerEventId_key";
--   DROP INDEX IF EXISTS "TrainingPurchase_checkoutId_key";
--   ALTER TABLE "TrainingPurchase" DROP CONSTRAINT IF EXISTS "TrainingPurchase_versionId_fkey";
--   ALTER TABLE "TrainingPurchase"
--       DROP COLUMN IF EXISTS "refundReason", DROP COLUMN IF EXISTS "confirmedAt",
--       DROP COLUMN IF EXISTS "idempotencyKey", DROP COLUMN IF EXISTS "providerEventId",
--       DROP COLUMN IF EXISTS "provider", DROP COLUMN IF EXISTS "checkoutId",
--       DROP COLUMN IF EXISTS "offerSnapshot", DROP COLUMN IF EXISTS "versionId";
