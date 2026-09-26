import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createTrainingPurchase } from "../domain/training-purchase";
import { TrainingProductStatus, TrainingPurchaseStatus } from "../domain/enums";
import { AcquireFreeTrainingProduct, type AcquireFreeTrainingProductRepository } from "./acquire-free-training-product";
import { assertProductPurchasable } from "./assert-product-purchasable";
import { StripePaymentProvider } from "../infrastructure/stripe-payment-provider";
import { getPublicAppUrl } from "@/server/env";

export interface CheckoutPaymentProvider {
  createCheckoutSession(input: {
    checkoutId: string; productId: string; versionId: string; purchaseId: string; athleteId: string;
    amountMinor: number; currency: string; productTitle: string; successUrl: string; cancelUrl: string; idempotencyKey: string;
  }): Promise<{ id: string; url: string | null }>;
}

export const createMarketplaceCheckoutSchema = z.strictObject({
  productId: z.string().min(1),
  /** RF-203 — required so a retried/duplicated request never opens two checkouts. */
  idempotencyKey: z.string().min(1).max(200),
});
export type CreateMarketplaceCheckoutInput = z.infer<typeof createMarketplaceCheckoutSchema>;

export type CreateMarketplaceCheckoutRepository = AcquireFreeTrainingProductRepository;

/**
 * TM039 (RF-108) — `POST /api/marketplace/checkout`'s use case.
 *
 * Free products (`priceCents=null`, Q7) delegate entirely to
 * `AcquireFreeTrainingProduct` (TM038) and return an already-usable license.
 *
 * Paid products only get a `PENDING` `TrainingPurchase` with a frozen
 * `offerSnapshot` — this use case deliberately NEVER promotes a purchase to
 * `COMPLETED`. That happens only from a verified webhook
 * (`ConfirmTrainingPurchaseFromWebhook`, TM060, Onda 2) per design D-02/
 * RF-202. Building a "confirm" path here would have to be undone later.
 *
 * Idempotent on `idempotencyKey` (scoped per athlete): reuses
 * `TrainingPurchase.checkoutId`'s `@unique` index (migration 0038) the same
 * way `AcquireFreeTrainingProduct` reuses it for the free path — see that
 * file's doc comment for the create-then-catch-P2002 reasoning.
 *
 * TM062 (Q2 decided): this checkout is EXCLUSIVELY for the TrainingProduct
 * itself. "Contratar acompanhamento" (hiring an independent coach to follow
 * an already-owned license) never flows through here, is never bundled into
 * this price, and never appears in this summary — it is a separate, free,
 * non-monetized authorization between athlete and coach (Onda 3,
 * LicenseCoachEngagement/InviteCoachToLicense). If paid coaching is ever
 * wanted, that needs its own checkout/product concept later — this one does
 * not grow a "coaching included" line item.
 */
export class CreateMarketplaceCheckout {
  private readonly acquireFree: AcquireFreeTrainingProduct;
  private readonly provider: CheckoutPaymentProvider;

  constructor(
    private readonly db: CreateMarketplaceCheckoutRepository,
    private readonly clock: () => Date = () => new Date(),
    provider?: CheckoutPaymentProvider,
  ) {
    this.acquireFree = new AcquireFreeTrainingProduct(db, clock);
    this.provider = provider ?? new StripePaymentProvider();
  }

  async execute(athleteId: string, raw: unknown) {
    const input = createMarketplaceCheckoutSchema.parse(raw);

    const product = await this.db.trainingProduct.findUnique({
      where: { id: input.productId },
      select: { id: true, title: true, status: true, priceCents: true, currency: true, currentVersionId: true, visibility: true, schoolId: true, coachId: true },
    });
    if (!product) {
      throw new SchoolError("PRODUCT_NOT_FOUND", "Produto não encontrado.", 404);
    }
    if (product.status !== TrainingProductStatus.PUBLISHED) {
      throw new SchoolError("PRODUCT_NOT_AVAILABLE", "Este produto não está disponível para compra.", 409);
    }
    if (!product.currentVersionId) {
      throw new SchoolError("PRODUCT_NO_VERSION", "Produto sem versão publicada.", 409);
    }
    // TM058 (RF-201/RF-105) — SCHOOL_ONLY/PRIVATE eligibility, same check as the free path.
    await assertProductPurchasable(this.db, athleteId, product);

    if (product.priceCents === null) {
      const result = await this.acquireFree.execute(athleteId, { productId: input.productId });
      return { kind: "free" as const, ...result };
    }

    const pending = await this.createPendingPaidPurchase(athleteId, input, product);

    // TM059/TM062 — the actual provider call happens OUTSIDE the DB
    // transaction (it is a network call to Stripe, not a database write).
    // Stripe's own Idempotency-Key handling (docs.stripe.com/api/idempotent_requests)
    // makes a retry here — e.g. `alreadyPending: true` — return the SAME
    // session/url rather than creating a second one.
    const appUrl = getPublicAppUrl();
    const checkoutId = `checkout:${athleteId}:${input.idempotencyKey}`;
    const session = await this.provider.createCheckoutSession({
      checkoutId,
      productId: product.id,
      versionId: product.currentVersionId,
      purchaseId: pending.purchase.id,
      athleteId,
      amountMinor: product.priceCents,
      currency: product.currency ?? "BRL",
      productTitle: product.title,
      successUrl: `${appUrl}/marketplace/${product.id}/checkout?purchaseId=${pending.purchase.id}&result=success`,
      cancelUrl: `${appUrl}/marketplace/${product.id}/checkout?purchaseId=${pending.purchase.id}&result=cancelled`,
      idempotencyKey: checkoutId,
    });

    return { ...pending, checkoutUrl: session.url };
  }

  private async createPendingPaidPurchase(
    athleteId: string,
    input: CreateMarketplaceCheckoutInput,
    product: {
      id: string; priceCents: number | null; currency: string | null; currentVersionId: string | null;
      coachId: string | null; schoolId: string | null;
    },
  ) {
    const now = this.clock();
    const checkoutId = `checkout:${athleteId}:${input.idempotencyKey}`;

    return this.db.$transaction(async (tx) => {
      const existing = await tx.trainingPurchase.findUnique({
        where: { checkoutId },
        select: { id: true, productId: true, athleteId: true, status: true, pricePaid: true, currency: true, purchasedAt: true },
      });
      if (existing) {
        return { kind: "paid" as const, purchase: existing, alreadyPending: true };
      }

      const purchaseId = randomUUID();
      // Validates shape via the same domain constructor CreateTrainingPurchase
      // uses; offerSnapshot/checkoutId/idempotencyKey/versionId (TM005) are
      // appended directly below since they postdate this schema (same
      // established pattern as AcquireFreeTrainingProduct).
      const purchase = createTrainingPurchase(
        {
          id: purchaseId,
          productId: product.id,
          athleteId,
          paymentRef: null,
          pricePaid: product.priceCents,
          currency: product.currency,
          status: TrainingPurchaseStatus.PENDING,
        },
        now,
      );
      // TM058/TM067 — seller identity frozen alongside price/currency, so
      // the ledger entry created from the eventual webhook confirmation
      // (TM067) never has to re-derive "who was the seller at sale time"
      // from the (possibly since-changed) product row.
      const offerSnapshot = {
        price: product.priceCents,
        currency: product.currency,
        productId: product.id,
        versionId: product.currentVersionId,
        sellerType: product.coachId ? "COACH" as const : "SCHOOL" as const,
        sellerId: product.coachId ?? product.schoolId,
      };

      try {
        const created = await tx.trainingPurchase.create({
          data: {
            id: purchase.id, productId: purchase.productId, athleteId: purchase.athleteId,
            versionId: product.currentVersionId,
            paymentRef: purchase.paymentRef, pricePaid: purchase.pricePaid, currency: purchase.currency,
            status: purchase.status, purchasedAt: purchase.purchasedAt,
            checkoutId, idempotencyKey: input.idempotencyKey, offerSnapshot,
          },
          select: { id: true, productId: true, athleteId: true, status: true, pricePaid: true, currency: true, purchasedAt: true },
        });
        return { kind: "paid" as const, purchase: created, alreadyPending: false };
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          const winner = await tx.trainingPurchase.findUnique({
            where: { checkoutId },
            select: { id: true, productId: true, athleteId: true, status: true, pricePaid: true, currency: true, purchasedAt: true },
          });
          if (winner) return { kind: "paid" as const, purchase: winner, alreadyPending: true };
        }
        throw error;
      }
    });
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
