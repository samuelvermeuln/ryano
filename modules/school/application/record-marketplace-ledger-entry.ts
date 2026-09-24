import type { PrismaClient } from "@prisma/client";
import { SellerLedgerEntryType } from "../domain/enums";

export interface MarketplaceLedgerRepository {
  sellerAccount: Pick<PrismaClient["sellerAccount"], "upsert">;
  sellerLedgerEntry: Pick<PrismaClient["sellerLedgerEntry"], "create" | "findFirst">;
}

export interface RecordSaleLedgerEntryInput {
  purchaseId: string;
  sellerType: "COACH" | "SCHOOL";
  sellerId: string;
  provider: string;
  grossAmount: number;
  currency: string;
  feeBps: number;
}

/**
 * TM067 (RF-205) — one auditable ledger row per financial event; split/fee
 * is never a constant here (see `marketplace-fee-settings.ts`). Called from
 * inside `ConfirmTrainingPurchaseFromWebhook`'s own transaction — this file
 * has no `$transaction` of its own, it only ever writes through the `tx`
 * handle its caller already opened, so a SALE row and the purchase/license
 * promotion commit or roll back together.
 *
 * `SellerAccount` is get-or-created here (upsert on its
 * `[sellerType, sellerId, provider]` unique key) — seller onboarding/KYC is
 * out of this task's scope; the row starts `kycStatus: PENDING` and gets a
 * real `payoutAccountRef` only once that (unbuilt) flow exists.
 */
export async function recordMarketplaceSaleLedgerEntry(
  tx: MarketplaceLedgerRepository,
  input: RecordSaleLedgerEntryInput,
) {
  const feeAmount = Math.round((input.grossAmount * input.feeBps) / 10000);
  const netAmount = input.grossAmount - feeAmount;

  const sellerAccount = await tx.sellerAccount.upsert({
    where: {
      sellerType_sellerId_provider: {
        sellerType: input.sellerType,
        sellerId: input.sellerId,
        provider: input.provider,
      },
    },
    create: { sellerType: input.sellerType, sellerId: input.sellerId, provider: input.provider },
    update: {},
  });

  return tx.sellerLedgerEntry.create({
    data: {
      sellerAccountId: sellerAccount.id,
      purchaseId: input.purchaseId,
      grossAmount: input.grossAmount,
      feeAmount,
      netAmount,
      currency: input.currency,
      type: SellerLedgerEntryType.SALE,
    },
  });
}

/**
 * Reverses the purchase's own SALE entry exactly — never recomputed from
 * whatever fee config is in effect at refund time (RF-205's "reversão"
 * requirement). A purchase with no SALE ledger row (e.g. one confirmed
 * before TM067 shipped) is not an error: refund itself still proceeds
 * (TM065 already handles that), there is simply nothing to reverse here.
 */
export async function recordMarketplaceRefundLedgerEntry(
  tx: MarketplaceLedgerRepository,
  purchaseId: string,
) {
  const saleEntry = await tx.sellerLedgerEntry.findFirst({
    where: { purchaseId, type: SellerLedgerEntryType.SALE },
    select: { sellerAccountId: true, grossAmount: true, feeAmount: true, netAmount: true, currency: true },
  });
  if (!saleEntry) return null;

  return tx.sellerLedgerEntry.create({
    data: {
      sellerAccountId: saleEntry.sellerAccountId,
      purchaseId,
      grossAmount: -saleEntry.grossAmount,
      feeAmount: -saleEntry.feeAmount,
      netAmount: -saleEntry.netAmount,
      currency: saleEntry.currency,
      type: SellerLedgerEntryType.REFUND,
    },
  });
}
