import { env } from "@/server/env";

/**
 * TM067 (RF-205) — "split, taxa e repasse ao vendedor DEVEM ser
 * parametrizáveis... nunca uma constante no código." `MARKETPLACE_PLATFORM_FEE_BPS`
 * is read here, once, and nowhere else computes a fee — changing it is an
 * env/config update, not a code change or deploy (same category of
 * operational knob as `STRIPE_SECRET_KEY`).
 *
 * Placeholder default (15%) — Produto has not yet decided the real
 * price/repasse/tax policy (`.kiro/specs/ryvano-marketplace-planos-treino/STATUS.md`
 * §7, Q5). Whatever value was actually applied at SALE time is what gets
 * persisted on the `SellerLedgerEntry` row (see `record-marketplace-ledger-entry.ts`)
 * — a later config change never rewrites history, and a REFUND reversal
 * always mirrors the original SALE entry, never recomputes from the
 * config in effect at refund time.
 */
export const DEFAULT_MARKETPLACE_PLATFORM_FEE_BPS = 1500;

export function getMarketplacePlatformFeeBps(): number {
  const raw = env.MARKETPLACE_PLATFORM_FEE_BPS;
  if (!raw) return DEFAULT_MARKETPLACE_PLATFORM_FEE_BPS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) {
    return DEFAULT_MARKETPLACE_PLATFORM_FEE_BPS;
  }
  return Math.round(parsed);
}
