import type Stripe from "stripe";
import { ConfirmTrainingPurchaseFromWebhook } from "./confirm-training-purchase-from-webhook";
import { RefundTrainingPurchase } from "./refund-training-purchase";

export interface ReconciliationPaymentProvider {
  listUndeliveredEvents(options: { types: string[]; limit?: number }): Promise<Stripe.Event[]>;
}

const RECONCILED_EVENT_TYPES = ["checkout.session.completed", "refund.created"];

export interface ReconciliationFailure {
  eventId: string;
  eventType: string;
  message: string;
}

export interface ReconciliationSummary {
  checked: number;
  confirmed: number;
  refunded: number;
  alreadyProcessed: number;
  failed: ReconciliationFailure[];
}

/**
 * TM064 (RF-203) — periodic reconciliation for payment events our webhook
 * endpoint (TM061) never received, following Stripe's own documented
 * recovery procedure (`StripePaymentProvider.listUndeliveredEvents`, see its
 * doc comment for the confirmed official-docs citation). Every event is
 * replayed through the EXACT SAME idempotent use cases the live webhook
 * route dispatches to — `ConfirmTrainingPurchaseFromWebhook` /
 * `RefundTrainingPurchase` — never a parallel/duplicated code path. Both are
 * idempotent purely from the purchase's own persisted status, so running
 * this job twice over the same event, or racing it against a late webhook
 * retry from Stripe itself, cannot create a second license or a second
 * refund.
 *
 * One event failing (e.g. a purchase row that no longer matches, a
 * transient DB error) is recorded and skipped — it never aborts the batch,
 * since an isolated failure blocking every other pending event would be
 * worse than the gap this job exists to close.
 */
export class ReconcileMarketplacePayments {
  constructor(
    private readonly provider: ReconciliationPaymentProvider,
    private readonly confirmPurchase: Pick<ConfirmTrainingPurchaseFromWebhook, "execute">,
    private readonly refundPurchase: Pick<RefundTrainingPurchase, "execute">,
  ) {}

  async execute(): Promise<ReconciliationSummary> {
    const events = await this.provider.listUndeliveredEvents({ types: RECONCILED_EVENT_TYPES });

    const summary: ReconciliationSummary = {
      checked: events.length,
      confirmed: 0,
      refunded: 0,
      alreadyProcessed: 0,
      failed: [],
    };

    for (const event of events) {
      try {
        if (event.type === "refund.created") {
          const result = await this.refundPurchase.execute({ kind: "provider_event", event });
          if (result.alreadyRefunded) summary.alreadyProcessed += 1;
          else summary.refunded += 1;
        } else {
          const result = await this.confirmPurchase.execute(event);
          if (!result.handled) continue;
          if (result.alreadyProcessed) summary.alreadyProcessed += 1;
          else summary.confirmed += 1;
        }
      } catch (error) {
        summary.failed.push({
          eventId: event.id,
          eventType: event.type,
          message: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }

    return summary;
  }
}
