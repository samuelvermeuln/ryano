/**
 * TM061 (RF-202) — `POST /api/marketplace/payment-webhook`. Thin adapter
 * over `ConfirmTrainingPurchaseFromWebhook` (TM060) and, for refunds,
 * `RefundTrainingPurchase` (TM065/TM066).
 *
 * Signature verification happens FIRST, using the raw request body
 * (`request.text()`, never `request.json()` — Stripe's signature check
 * fails if the body was reparsed/reserialized, docs.stripe.com/webhooks).
 * A missing/invalid `Stripe-Signature` is rejected before any database call.
 */
import { prisma } from "@/server/db";
import { ConfirmTrainingPurchaseFromWebhook } from "@/modules/school/application/confirm-training-purchase-from-webhook";
import { RefundTrainingPurchase } from "@/modules/school/application/refund-training-purchase";
import { StripePaymentProvider } from "@/modules/school/infrastructure/stripe-payment-provider";
import { schoolMetrics } from "@/modules/school/infrastructure/metrics";
import { schoolLogger } from "@/modules/school/infrastructure/logger";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const provider = new StripePaymentProvider();
const confirmPurchase = new ConfirmTrainingPurchaseFromWebhook(prisma);
const refundPurchase = new RefundTrainingPurchase(prisma);

export async function POST(request: Request) {
  const log = schoolLogger("marketplace-payment-webhook");
  try {
    assertMarketplaceEnabled();

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      throw new SchoolError("WEBHOOK_SIGNATURE_INVALID", "Assinatura ausente.", 400);
    }

    // Raw body — see class doc comment. Never JSON.parse before this call.
    const rawBody = await request.text();

    let event;
    try {
      event = provider.verifyWebhookEvent(rawBody, signature);
    } catch {
      schoolMetrics.marketplaceWebhookVerificationFailed({ provider: "stripe", correlationId: log.correlationId });
      // Never echo the signature/secret or the verification library's raw error back.
      throw new SchoolError("WEBHOOK_SIGNATURE_INVALID", "Assinatura inválida.", 400);
    }

    log.info("webhook_received", { eventId: event.id, eventType: event.type });

    // TM066 — refund events (Stripe's current recommendation is
    // refund.created/refund.failed, not the older charge.refunded — see
    // STATUS.md §4.3). Anything else goes to the purchase-confirmation path,
    // which itself no-ops on event types it does not handle.
    if (event.type === "refund.created") {
      await refundPurchase.execute({ kind: "provider_event", event });
    } else {
      await confirmPurchase.execute(event);
    }

    // Fast 2xx — this repo's processing is lightweight DB writes, no
    // slow downstream calls, so synchronous handling before responding is
    // within Stripe's "respond quickly" guidance.
    return Response.json({ received: true }, { status: 200 });
  } catch (error) {
    if (error instanceof SchoolError) {
      log.warn("webhook_rejected", { code: error.code });
      return Response.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "MARKETPLACE_DISABLED") {
      return Response.json({ code: "MARKETPLACE_DISABLED", message: "Recurso indisponível." }, { status: 404 });
    }
    log.error("webhook_unexpected_error", { error: error instanceof Error ? error.message : "unknown" });
    return Response.json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." }, { status: 500 });
  }
}
