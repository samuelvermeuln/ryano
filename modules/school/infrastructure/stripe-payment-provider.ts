import Stripe from "stripe";
import { env } from "@/server/env";
import type { ProviderConnectedAccount } from "@/modules/school/domain/seller-account";
import type {
  CreateConnectedAccountInput,
  SellerOnboardingProvider,
} from "@/modules/school/application/seller-onboarding-provider";

/**
 * TM059 (RF-201, design D-10) — Stripe integration (Q5, decided by the user
 * this session). Every behavior below was confirmed against Stripe's current
 * official documentation before writing this file, per AGENTS.md's mandatory
 * official-docs checklist — full citations in
 * `.kiro/specs/ryvano-marketplace-planos-treino/STATUS.md` §4.3:
 *
 * - Checkout Session: `mode: "payment"` for a one-time purchase,
 *   `line_items[].price_data` (no pre-created Stripe `Price` needed — we own
 *   the product catalog, not Stripe), `client_reference_id` (<=200 chars —
 *   our `checkoutId`), `metadata` (productId/versionId/athleteId/purchaseId),
 *   `success_url`/`cancel_url`. https://docs.stripe.com/api/checkout/sessions/create
 * - Idempotent creation via the `Idempotency-Key` HTTP header (<=255 chars,
 *   cached >=24h) — passed as the Stripe SDK's second-argument request
 *   option, never encoded into the request body.
 *   https://docs.stripe.com/api/idempotent_requests
 * - Webhook verification: `Stripe-Signature` header, `whsec_...` secret,
 *   `stripe.webhooks.constructEvent(rawBody, signature, secret)` — REQUIRES
 *   the raw, unparsed request body (any framework body-parsing before this
 *   call breaks verification). https://docs.stripe.com/webhooks
 * - Fulfillment happens ONLY from the `checkout.session.completed` webhook
 *   event, never from the browser redirect — matches design D-02 exactly
 *   (this repo already never trusted a client-supplied confirmation).
 * - Refund events are `refund.created`/`refund.failed` (NOT the older
 *   `charge.refunded` — Stripe's 2024-10-28 changelog moved to this so the
 *   same event works whether or not a `Charge` object exists).
 *   https://docs.stripe.com/changelog/acacia/2024-10-28/refund-webhook-update
 * - Reconciliation for events our webhook endpoint never successfully
 *   received (TM064): List Events with `types` + `delivery_success: false`
 *   (events not yet delivered to ANY of our webhook endpoints), auto-paged.
 *   Stripe retains events for 30 days only. This is Stripe's own documented
 *   recovery procedure, not a bespoke polling scheme.
 *   https://docs.stripe.com/webhooks/process-undelivered-events
 *
 * Secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) are read from
 * `server/env.ts` only, never logged, never sent to the client — the client
 * only ever receives the Checkout Session's redirect `url`.
 */

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

export interface CreateStripeCheckoutSessionInput {
  /** Our TrainingPurchase.checkoutId — becomes Stripe's client_reference_id. */
  checkoutId: string;
  productId: string;
  versionId: string;
  purchaseId: string;
  athleteId: string;
  /** Minor currency units (centavos), same unit TrainingProduct.priceCents already uses. */
  amountMinor: number;
  /** ISO 4217, lowercase for the Stripe API (e.g. "brl"). */
  currency: string;
  productTitle: string;
  successUrl: string;
  cancelUrl: string;
  /** Reused as Stripe's Idempotency-Key — same key our own checkoutId dedup already uses upstream. */
  idempotencyKey: string;
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
}

/**
 * SAM-13 — projection of a Stripe `Account` into the provider-agnostic shape
 * the domain reads. Only status fields cross this boundary: never bank data,
 * never the person/company hashes.
 */
export function toProviderConnectedAccount(account: Stripe.Account): ProviderConnectedAccount {
  const requirements = account.requirements;
  return {
    accountRef: account.id,
    detailsSubmitted: account.details_submitted ?? false,
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    requirementsDue: [...(requirements?.currently_due ?? []), ...(requirements?.past_due ?? [])],
    disabledReason: requirements?.disabled_reason ?? null,
  };
}

export class StripePaymentProvider implements SellerOnboardingProvider {
  readonly providerId = "stripe";

  /**
   * SAM-13 — Stripe Connect hosted onboarding, confirmed against the current
   * official docs (docs.stripe.com/api/accounts/create,
   * docs.stripe.com/api/account_links/create, docs.stripe.com/connect/hosted-onboarding):
   * - `type` is deprecated; the account is configured through `controller`
   *   (Express dashboard, platform pays fees and is liable for losses — the
   *   platform already collects every payment, RF-201).
   * - `capabilities.transfers` is what a platform-collected sale needs to be
   *   paid out to the seller; `card_payments` is not requested.
   * - `country`/`email`/`business_type` are prefilled so hosted onboarding
   *   does not ask again; bank/identity data is collected by Stripe only.
   */
  async createConnectedAccount(input: CreateConnectedAccountInput): Promise<{ accountRef: string }> {
    const stripe = getStripeClient();
    const account = await stripe.accounts.create({
      country: "BR",
      email: input.email ?? undefined,
      business_type: input.businessType,
      controller: {
        fees: { payer: "application" },
        losses: { payments: "application" },
        stripe_dashboard: { type: "express" },
      },
      capabilities: { transfers: { requested: true } },
      business_profile: { name: input.displayName },
      metadata: { sellerType: input.sellerType, sellerId: input.sellerId },
    });
    return { accountRef: account.id };
  }

  /**
   * Single-use, short-lived hosted onboarding URL. `return_url` does NOT mean
   * onboarding finished — the caller must re-read the account (or rely on
   * `account.updated`) before showing anything as verified. `refresh_url` is
   * where Stripe sends an expired/reused link; it must mint a new one.
   */
  async createOnboardingLink(input: { accountRef: string; returnUrl: string; refreshUrl: string }): Promise<{ url: string }> {
    const stripe = getStripeClient();
    const link = await stripe.accountLinks.create({
      account: input.accountRef,
      type: "account_onboarding",
      return_url: input.returnUrl,
      refresh_url: input.refreshUrl,
      collection_options: { fields: "eventually_due" },
    });
    return { url: link.url };
  }

  /** Express-dashboard login link (docs.stripe.com/api/accounts/login_link) for a verified seller to manage its own data. */
  async createDashboardLink(accountRef: string): Promise<{ url: string }> {
    const stripe = getStripeClient();
    const link = await stripe.accounts.createLoginLink(accountRef);
    return { url: link.url };
  }

  async retrieveConnectedAccount(accountRef: string): Promise<ProviderConnectedAccount> {
    const stripe = getStripeClient();
    return toProviderConnectedAccount(await stripe.accounts.retrieve(accountRef));
  }

  /** Creates a hosted Checkout Session for a one-time payment. Never accepts a price from the caller beyond what was already server-revalidated (TM058). */
  async createCheckoutSession(input: CreateStripeCheckoutSessionInput): Promise<StripeCheckoutSession> {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: input.checkoutId,
        line_items: [
          {
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountMinor,
              product_data: { name: input.productTitle },
            },
            quantity: 1,
          },
        ],
        metadata: {
          productId: input.productId,
          versionId: input.versionId,
          purchaseId: input.purchaseId,
          athleteId: input.athleteId,
          checkoutId: input.checkoutId,
        },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { id: session.id, url: session.url };
  }

  /**
   * Verifies a webhook request is genuinely from Stripe. `rawBody` MUST be
   * the exact, unparsed request body bytes — see class doc comment.
   * Throws if the signature is invalid or the timestamp is outside the
   * default 5-minute replay-attack tolerance.
   */
  verifyWebhookEvent(rawBody: string | Buffer, signatureHeader: string): Stripe.Event {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("STRIPE_NOT_CONFIGURED");
    }
    // Uses the class instance so a missing STRIPE_SECRET_KEY still surfaces
    // as STRIPE_NOT_CONFIGURED consistently with createCheckoutSession, even
    // though signature verification itself does not need the secret key.
    const stripe = getStripeClient();
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET);
  }

  /**
   * TM064 (RF-203) — events of the given types that were never successfully
   * delivered to any webhook endpoint, per Stripe's official undelivered-
   * events procedure (class doc comment). These events are fetched directly
   * from Stripe's authenticated API (not an inbound HTTP request), so there
   * is no signature to verify here — the trust boundary is the secret key
   * itself, same as every other authenticated call this class makes.
   */
  async listUndeliveredEvents(options: { types: string[]; limit?: number }): Promise<Stripe.Event[]> {
    const stripe = getStripeClient();
    return stripe.events
      .list({ types: options.types, delivery_success: false })
      .autoPagingToArray({ limit: options.limit ?? 200 });
  }
}
