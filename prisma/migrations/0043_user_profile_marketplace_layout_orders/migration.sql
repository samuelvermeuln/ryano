-- TM050 — CustomizableCardGrid: 3 new surfaces (marketplace-catalog,
-- athlete-plan, coach-studio). Same convention as `dashboardLayoutOrder`/
-- `activityLayoutOrder`/`integrationsLayoutOrder` (migrations 0001-ish/0007):
-- one dedicated nullable column per surface, never a shared/generic key —
-- design D-09 / RF-113 explicitly requires this so a marketplace surface
-- can never overwrite the athlete's personal dashboard order.
--
-- NUMBERING NOTE: this is migration 0043. The original task-list.md text for
-- TM057 (Onda 2, "SellerAccount e ledger") also said "Migration 0043" when
-- it was written — that was written before this task existed and needs to
-- become 0044 (or whatever the next free number is) when TM057 is actually
-- implemented. Flagged in STATUS.md.

ALTER TABLE "UserProfile"
    ADD COLUMN "marketplaceCatalogLayoutOrder" JSONB,
    ADD COLUMN "athletePlanLayoutOrder"        JSONB,
    ADD COLUMN "coachStudioLayoutOrder"        JSONB;

-- Rollback:
--   ALTER TABLE "UserProfile"
--       DROP COLUMN IF EXISTS "coachStudioLayoutOrder",
--       DROP COLUMN IF EXISTS "athletePlanLayoutOrder",
--       DROP COLUMN IF EXISTS "marketplaceCatalogLayoutOrder";
