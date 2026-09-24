-- TM003 — TrainingProduct: catalog/commercial metadata + XOR ownership.
--
-- Every new column is nullable and additive: existing rows stay valid, no
-- rewrite is triggered. `slug` is unique but nullable (existing rows keep
-- slug=NULL — Postgres does not collide NULLs in a unique index).
--
-- Q7 (priceCents=null vs priceCents=0): decided here, since it blocks this
-- migration. `priceCents IS NULL` means free (RF-108's zero-provider path);
-- `priceCents = 0` is treated as an invalid, ambiguous state and rejected by
-- CHECK below — a "paid" product must have a positive price. If a genuinely
-- free-with-checkout-record product is ever needed, that is a product
-- decision to revisit explicitly, not a silent `0`.
--
-- RF-003: schoolId/coachId must be exactly one, enforced at the database,
-- not only in `createTrainingProduct` (modules/school/domain/training-product.ts).
-- The domain-level check stays (defense in depth); this CHECK is the backstop
-- for any write path that bypasses it (seed scripts, manual fixes, a future
-- bulk migration).

ALTER TABLE "TrainingProduct"
    ADD COLUMN "slug"               VARCHAR(220),
    ADD COLUMN "coverMediaId"       TEXT,
    ADD COLUMN "objective"          VARCHAR(300),
    ADD COLUMN "difficulty"         VARCHAR(50),
    ADD COLUMN "goalType"           VARCHAR(50),
    ADD COLUMN "targetEventType"    VARCHAR(50),
    ADD COLUMN "targetDistance"     VARCHAR(50),
    ADD COLUMN "sessionsPerWeek"    INTEGER,
    ADD COLUMN "sessionDurationMin" INTEGER,
    ADD COLUMN "sessionDurationMax" INTEGER,
    ADD COLUMN "weeklyMinutesMin"   INTEGER,
    ADD COLUMN "weeklyMinutesMax"   INTEGER,
    ADD COLUMN "sessionCount"       INTEGER,
    ADD COLUMN "equipment"          VARCHAR(500),
    ADD COLUMN "language"           VARCHAR(10),
    ADD COLUMN "availability"       VARCHAR(100),
    ADD COLUMN "sellerPolicyVersion" VARCHAR(50),
    ADD COLUMN "previewVersionId"   TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TrainingProduct_slug_key" ON "TrainingProduct" ("slug");

-- XOR: exactly one commercial owner.
ALTER TABLE "TrainingProduct"
    ADD CONSTRAINT "TrainingProduct_owner_xor_check"
    CHECK (("schoolId" IS NOT NULL) <> ("coachId" IS NOT NULL));

-- Q7: null = free; 0 is never valid (would be ambiguous with "free").
ALTER TABLE "TrainingProduct"
    ADD CONSTRAINT "TrainingProduct_priceCents_positive_check"
    CHECK ("priceCents" IS NULL OR "priceCents" > 0);

-- Rollback (manual, in reverse order):
--   ALTER TABLE "TrainingProduct" DROP CONSTRAINT IF EXISTS "TrainingProduct_priceCents_positive_check";
--   ALTER TABLE "TrainingProduct" DROP CONSTRAINT IF EXISTS "TrainingProduct_owner_xor_check";
--   DROP INDEX IF EXISTS "TrainingProduct_slug_key";
--   ALTER TABLE "TrainingProduct"
--       DROP COLUMN IF EXISTS "previewVersionId", DROP COLUMN IF EXISTS "sellerPolicyVersion",
--       DROP COLUMN IF EXISTS "availability", DROP COLUMN IF EXISTS "language",
--       DROP COLUMN IF EXISTS "equipment", DROP COLUMN IF EXISTS "sessionCount",
--       DROP COLUMN IF EXISTS "weeklyMinutesMax", DROP COLUMN IF EXISTS "weeklyMinutesMin",
--       DROP COLUMN IF EXISTS "sessionDurationMax", DROP COLUMN IF EXISTS "sessionDurationMin",
--       DROP COLUMN IF EXISTS "sessionsPerWeek", DROP COLUMN IF EXISTS "targetDistance",
--       DROP COLUMN IF EXISTS "targetEventType", DROP COLUMN IF EXISTS "goalType",
--       DROP COLUMN IF EXISTS "difficulty", DROP COLUMN IF EXISTS "objective",
--       DROP COLUMN IF EXISTS "coverMediaId", DROP COLUMN IF EXISTS "slug";
-- Before rolling back the two CHECKs: confirm no row was written since this
-- migration that relies on them (e.g. a paid product with priceCents=0
-- inserted by code that assumed the old, unconstrained schema).
