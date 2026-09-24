import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { SchoolError } from "../domain/errors";
import { createTrainingLicense } from "../domain/training-license";
import { TrainingPurchaseStatus } from "../domain/enums";
import { schoolMetrics } from "../infrastructure/metrics";
import { getMarketplacePlatformFeeBps } from "../config/marketplace-fee-settings";
import { recordMarketplaceSaleLedgerEntry } from "./record-marketplace-ledger-entry";

export interface ConfirmTrainingPurchaseFromWebhookRepository {
  trainingPurchase: Pick<PrismaClient["trainingPurchase"], "findUnique" | "findFirst" | "update">;
  trainingLicense: Pick<PrismaClient["trainingLicense"], "findFirst" | "create">;
  sellerAccount: Pick<PrismaClient["sellerAccount"], "upsert">;
  sellerLedgerEntry: Pick<PrismaClient["sellerLedgerEntry"], "create" | "findFirst">;
  $transaction: PrismaClient["$transaction"];
}

/**
 * TM060 (RF-202, RNF-003, design D-02) — the SECOND half of
 * `CreateTrainingPurchase`'s original split (the first, TM038, is the free
 * path). The event passed in MUST already be signature-verified by the
 * caller (the route, TM061) — this class trusts `event` completely and never
 * re-derives trust from a client-supplied `paymentRef` (that is exactly the
 * defect RF-002/TM002 fixed in the original, unsplit class).
 *
 * Idempotent on `event.id` (RF-203): a `checkout.session.completed` event
 * whose purchase is already COMPLETED is a no-op — Stripe's own docs say
 * delivery is at-least-once with no ordering guarantee, so relying on
 * anything but the purchase's OWN persisted status for "already handled"
 * would be wrong. `provider`+`providerEventId` are also written (the
 * `@@unique([provider, providerEventId])` index from migration 0038 is a
 * second, DB-enforced backstop against a genuine race between two
 * concurrent webhook deliveries reaching this code at the same instant).
 */
export class ConfirmTrainingPurchaseFromWebhook {
  constructor(
    private readonly db: ConfirmTrainingPurchaseFromWebhookRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(event: Stripe.Event) {
    if (event.type !== "checkout.session.completed") {
      // Not our concern here — e.g. checkout.session.expired. The route
      // (TM061) still returns 2xx so Stripe does not retry an event we
      // deliberately do not act on.
      return { handled: false as const, reason: "unhandled_event_type" as const };
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const checkoutId = session.client_reference_id;
    if (!checkoutId) {
      throw new SchoolError("PURCHASE_IDEMPOTENCY_CONFLICT", "Evento sem client_reference_id.", 409);
    }

    const purchase = await this.db.trainingPurchase.findUnique({
      where: { checkoutId },
      select: {
        id: true, productId: true, versionId: true, athleteId: true, status: true,
        pricePaid: true, currency: true, offerSnapshot: true, providerEventId: true,
      },
    });
    if (!purchase) {
      throw new SchoolError("PRODUCT_NOT_FOUND", "Compra não encontrada para este checkout.", 404);
    }

    // RF-203 — idempotent: an already-COMPLETED purchase (from an earlier
    // delivery of this same event, or any other) is a no-op, not an error.
    if (purchase.status === TrainingPurchaseStatus.COMPLETED) {
      const existingLicense = await this.db.trainingLicense.findFirst({
        where: { purchaseId: purchase.id },
        select: { id: true, productId: true, versionId: true, athleteId: true, status: true, startedAt: true },
      });
      return { handled: true as const, alreadyProcessed: true as const, purchase, license: existingLicense };
    }

    // RF-202 — the event's amount/currency/product/version must match the
    // frozen offerSnapshot (TM058) exactly; a mismatch is rejected WITHOUT
    // promoting the purchase, never "close enough".
    const snapshot = purchase.offerSnapshot as {
      price: number | null; currency: string | null; productId: string; versionId: string | null;
      sellerType: "COACH" | "SCHOOL"; sellerId: string;
    } | null;
    const eventAmount = session.amount_total;
    const eventCurrency = session.currency?.toUpperCase() ?? null;
    if (
      !snapshot ||
      eventAmount !== snapshot.price ||
      eventCurrency !== snapshot.currency ||
      session.metadata?.productId !== snapshot.productId ||
      session.metadata?.versionId !== snapshot.versionId
    ) {
      throw new SchoolError(
        "PURCHASE_IDEMPOTENCY_CONFLICT",
        "Evento do provedor não confere com a oferta congelada desta compra.",
        409,
      );
    }
    if (session.payment_status !== "paid") {
      throw new SchoolError("PRODUCT_NOT_AVAILABLE", "Pagamento não confirmado pelo provedor.", 409);
    }

    const now = this.clock();

    return this.db.$transaction(async (tx) => {
      // Sequential, not Promise.all — same discipline TM002 already fixed
      // for the free path; TrainingLicense.purchaseId is a real FK.
      const confirmedPurchase = await tx.trainingPurchase.update({
        where: { id: purchase.id, status: TrainingPurchaseStatus.PENDING }, // guards against a concurrent duplicate promoting first
        data: {
          status: TrainingPurchaseStatus.COMPLETED,
          confirmedAt: now,
          provider: "stripe",
          providerEventId: event.id,
          paymentRef: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
          updatedAt: now,
        },
        select: { id: true, productId: true, versionId: true, athleteId: true, status: true, purchasedAt: true },
      });

      const license = createTrainingLicense(
        {
          id: randomUUID(),
          productId: purchase.productId,
          versionId: purchase.versionId ?? snapshot.versionId!,
          purchaseId: purchase.id,
          athleteId: purchase.athleteId,
          startedAt: now,
          expiresAt: null,
          revokedAt: null,
        },
        now,
      );
      const createdLicense = await tx.trainingLicense.create({
        data: {
          id: license.id, productId: license.productId, versionId: license.versionId,
          purchaseId: license.purchaseId, athleteId: license.athleteId,
          status: license.status, startedAt: license.startedAt,
          expiresAt: license.expiresAt, revokedAt: license.revokedAt,
          calendarInstantiated: false,
        },
        select: { id: true, productId: true, versionId: true, athleteId: true, status: true, startedAt: true },
      });

      // TM067 (RF-205) — one auditable SALE ledger row per confirmed
      // purchase; fee read from config (never a constant here), seller
      // identity from the snapshot frozen at checkout (TM058), never
      // re-derived from the product row as it stands today.
      await recordMarketplaceSaleLedgerEntry(tx, {
        purchaseId: confirmedPurchase.id,
        sellerType: snapshot.sellerType,
        sellerId: snapshot.sellerId,
        provider: "stripe",
        grossAmount: snapshot.price!,
        currency: snapshot.currency!,
        feeBps: getMarketplacePlatformFeeBps(),
      });

      // TM070 (RNF-008) — dedicated event, not the free-path metric (a paid
      // confirmation is a distinct fact from a free acquisition).
      schoolMetrics.marketplacePurchaseConfirmed({
        productId: confirmedPurchase.productId, purchaseId: confirmedPurchase.id,
        licenseId: createdLicense.id, athleteId: createdLicense.athleteId, provider: "stripe",
      });

      return { handled: true as const, alreadyProcessed: false as const, purchase: confirmedPurchase, license: createdLicense };
    });
  }
}
