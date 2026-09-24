-- TM004 — TrainingProductVersion: schemaVersion + DB-enforced immutability.
--
-- RF-004 / design D-04: "the original stays stable" (spec principle 5) is the
-- product's central guarantee, so it is enforced by a trigger, not only by
-- convention in application code — application-level conventions have
-- already failed silently elsewhere in this codebase before being caught.
--
-- The trigger only rejects a changed `planPayload` or `changeNote` on a row
-- whose `publishedAt` was ALREADY non-null before the update (i.e. was
-- already published). Publishing itself (draft -> published, setting
-- publishedAt for the first time) is unaffected: OLD.publishedAt is still
-- NULL at that moment. Touching any other column (e.g. bookkeeping) on an
-- already-published row is also unaffected — only the two content columns.

ALTER TABLE "TrainingProductVersion"
    ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "contentHash"   VARCHAR(128);

CREATE OR REPLACE FUNCTION training_product_version_immutable_once_published()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."publishedAt" IS NOT NULL THEN
        IF NEW."planPayload" IS DISTINCT FROM OLD."planPayload"
           OR NEW."changeNote" IS DISTINCT FROM OLD."changeNote" THEN
            RAISE EXCEPTION
                'TrainingProductVersion % is published (publishedAt=%) and immutable: planPayload/changeNote cannot change. Publish a new version instead.',
                OLD."id", OLD."publishedAt"
                USING ERRCODE = '23514'; -- check_violation
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "training_product_version_immutability" ON "TrainingProductVersion";
CREATE TRIGGER "training_product_version_immutability"
    BEFORE UPDATE ON "TrainingProductVersion"
    FOR EACH ROW
    EXECUTE FUNCTION training_product_version_immutable_once_published();

-- Rollback (manual, in reverse order):
--   DROP TRIGGER IF EXISTS "training_product_version_immutability" ON "TrainingProductVersion";
--   DROP FUNCTION IF EXISTS training_product_version_immutable_once_published();
--   ALTER TABLE "TrainingProductVersion"
--       DROP COLUMN IF EXISTS "contentHash", DROP COLUMN IF EXISTS "schemaVersion";
-- Note: an administrative correction to a published version (design D-04)
-- must NEVER be done by dropping this trigger and running a raw UPDATE — it
-- must go through a new version. Dropping the trigger to "fix" data is
-- exactly the failure mode this migration exists to prevent.
