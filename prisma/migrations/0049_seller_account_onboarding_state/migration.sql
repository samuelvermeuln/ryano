-- SAM-13 — SellerAccount: onboarding/verification state mirrored from the
-- payment provider (Stripe Connect `account.updated` / on-return refresh), so
-- the Perfil can show "Cadastro iniciado / Aguardando verificação / Ação
-- necessária / Verificada" from a trusted backend source instead of the UI
-- guessing after a form submit.
--
-- Purely additive: new nullable/defaulted columns, no existing row changes,
-- no backfill needed (an existing row with no payoutAccountRef keeps meaning
-- "not configured"). Safe to apply on a live database; rollback is dropping
-- the six columns.
ALTER TABLE "SellerAccount"
  ADD COLUMN "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requirementsDue" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "disabledReason" VARCHAR(200),
  ADD COLUMN "verifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "providerSyncedAt" TIMESTAMPTZ(3);
