-- TM057 (RF-205) — SellerAccount + SellerLedgerEntry, seller payouts and
-- financial audit trail.
--
-- NUMBERING NOTE: this is 0044, not 0043 — the original task-list.md text
-- for this task said "Migration 0043" when it was written, before TM050
-- (Onda 1) took 0043 for UserProfile layout columns. Documented in
-- STATUS.md and in TM050's own Implementation Notes.
--
-- No fee/split percentage anywhere in this file (RF-205): `feeAmount`/
-- `netAmount` are computed by application code from configuration at write
-- time and stored as immutable facts on SellerLedgerEntry — changing the fee
-- configuration later never requires a schema change or migration.

CREATE TYPE "SellerType" AS ENUM ('COACH', 'SCHOOL');
CREATE TYPE "SellerKycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

CREATE TABLE "SellerAccount" (
    "id"               TEXT NOT NULL,
    "sellerType"       "SellerType" NOT NULL,
    "sellerId"         TEXT NOT NULL,
    "provider"         VARCHAR(50) NOT NULL,
    "payoutAccountRef" VARCHAR(200),
    "kycStatus"        "SellerKycStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updatedAt"        TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SellerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerAccount_sellerType_sellerId_provider_key"
    ON "SellerAccount" ("sellerType", "sellerId", "provider");

CREATE TYPE "SellerLedgerEntryType" AS ENUM ('SALE', 'REFUND', 'PAYOUT');

CREATE TABLE "SellerLedgerEntry" (
    "id"              TEXT NOT NULL,
    "sellerAccountId" TEXT NOT NULL,
    "purchaseId"      TEXT NOT NULL,
    "grossAmount"     INTEGER NOT NULL,
    "feeAmount"       INTEGER NOT NULL,
    "netAmount"       INTEGER NOT NULL,
    "currency"        VARCHAR(3) NOT NULL,
    "type"            "SellerLedgerEntryType" NOT NULL,
    "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

    CONSTRAINT "SellerLedgerEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SellerLedgerEntry"
    ADD CONSTRAINT "SellerLedgerEntry_sellerAccountId_fkey"
        FOREIGN KEY ("sellerAccountId") REFERENCES "SellerAccount"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SellerLedgerEntry_purchaseId_fkey"
        FOREIGN KEY ("purchaseId") REFERENCES "TrainingPurchase"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "SellerLedgerEntry_sellerAccountId_createdAt_idx" ON "SellerLedgerEntry" ("sellerAccountId", "createdAt");
CREATE INDEX "SellerLedgerEntry_purchaseId_idx" ON "SellerLedgerEntry" ("purchaseId");

-- Rollback (manual, in reverse order):
--   DROP TABLE IF EXISTS "SellerLedgerEntry";
--   DROP TYPE IF EXISTS "SellerLedgerEntryType";
--   DROP TABLE IF EXISTS "SellerAccount";
--   DROP TYPE IF EXISTS "SellerKycStatus";
--   DROP TYPE IF EXISTS "SellerType";
