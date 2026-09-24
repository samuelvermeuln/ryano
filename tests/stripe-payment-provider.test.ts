/**
 * TM059 — StripePaymentProvider. Confirms the exact shape of the calls this
 * class makes to the Stripe SDK matches what was verified against the
 * official docs (see class doc comment / STATUS.md §4.3), without hitting
 * the real network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  constructEvent: vi.fn(),
  eventsList: vi.fn(),
  env: { STRIPE_SECRET_KEY: "sk_test_123", STRIPE_WEBHOOK_SECRET: "whsec_test_123" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = { sessions: { create: mocks.sessionsCreate } };
    webhooks = { constructEvent: mocks.constructEvent };
    events = { list: mocks.eventsList };
  },
}));

import { StripePaymentProvider } from "@/modules/school/infrastructure/stripe-payment-provider";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.STRIPE_SECRET_KEY = "sk_test_123";
  mocks.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
  mocks.sessionsCreate.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
});

const baseInput = {
  checkoutId: "checkout:athlete-1:idem-1", productId: "prod-1", versionId: "ver-1",
  purchaseId: "pur-1", athleteId: "athlete-1", amountMinor: 4990, currency: "BRL",
  productTitle: "Corrida 5km", successUrl: "https://app.example/success", cancelUrl: "https://app.example/cancel",
  idempotencyKey: "idem-1",
};

describe("StripePaymentProvider.createCheckoutSession [TM059]", () => {
  it("cria sessão mode=payment com line_items[].price_data (sem Price pré-criado)", async () => {
    await new StripePaymentProvider().createCheckoutSession(baseInput);
    const [params] = mocks.sessionsCreate.mock.calls[0]!;
    expect(params.mode).toBe("payment");
    expect(params.line_items[0].price_data).toMatchObject({ currency: "brl", unit_amount: 4990 });
    expect(params.line_items[0].quantity).toBe(1);
  });

  it("client_reference_id = nosso checkoutId (reconciliação, docs.stripe.com/api/checkout/sessions/create)", async () => {
    await new StripePaymentProvider().createCheckoutSession(baseInput);
    const [params] = mocks.sessionsCreate.mock.calls[0]!;
    expect(params.client_reference_id).toBe(baseInput.checkoutId);
  });

  it("metadata carrega productId/versionId/athleteId/purchaseId — nunca dado de cartão", async () => {
    await new StripePaymentProvider().createCheckoutSession(baseInput);
    const [params] = mocks.sessionsCreate.mock.calls[0]!;
    expect(params.metadata).toMatchObject({
      productId: "prod-1", versionId: "ver-1", athleteId: "athlete-1", purchaseId: "pur-1",
    });
    expect(JSON.stringify(params.metadata)).not.toMatch(/card|cvv|pan/i);
  });

  it("usa o header Idempotency-Key (docs.stripe.com/api/idempotent_requests), não um campo no corpo", async () => {
    await new StripePaymentProvider().createCheckoutSession(baseInput);
    const [, options] = mocks.sessionsCreate.mock.calls[0]!;
    expect(options).toEqual({ idempotencyKey: "idem-1" });
  });

  it("success_url/cancel_url repassados sem alteração", async () => {
    await new StripePaymentProvider().createCheckoutSession(baseInput);
    const [params] = mocks.sessionsCreate.mock.calls[0]!;
    expect(params.success_url).toBe(baseInput.successUrl);
    expect(params.cancel_url).toBe(baseInput.cancelUrl);
  });

  it("retorna id e url da sessão", async () => {
    const out = await new StripePaymentProvider().createCheckoutSession(baseInput);
    expect(out).toEqual({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
  });

  it("lança STRIPE_NOT_CONFIGURED sem segredo configurado, nunca expõe o segredo ausente em detalhe", async () => {
    mocks.env.STRIPE_SECRET_KEY = "";
    await expect(new StripePaymentProvider().createCheckoutSession(baseInput)).rejects.toThrow("STRIPE_NOT_CONFIGURED");
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });
});

describe("StripePaymentProvider.verifyWebhookEvent [TM059]", () => {
  it("delega a stripe.webhooks.constructEvent com o corpo bruto e o header Stripe-Signature", () => {
    mocks.constructEvent.mockReturnValue({ id: "evt_1", type: "checkout.session.completed" });
    const raw = Buffer.from('{"id":"evt_1"}');
    const out = new StripePaymentProvider().verifyWebhookEvent(raw, "t=1,v1=abc");
    expect(mocks.constructEvent).toHaveBeenCalledWith(raw, "t=1,v1=abc", "whsec_test_123");
    expect(out).toMatchObject({ id: "evt_1" });
  });

  it("propaga erro de assinatura inválida sem engolir (SignatureVerificationError da lib real)", () => {
    mocks.constructEvent.mockImplementation(() => { throw new Error("No signatures found matching the expected signature for payload"); });
    expect(() => new StripePaymentProvider().verifyWebhookEvent("{}", "bad-sig")).toThrow(/signature/i);
  });

  it("lança STRIPE_NOT_CONFIGURED sem webhook secret configurado", () => {
    mocks.env.STRIPE_WEBHOOK_SECRET = "";
    expect(() => new StripePaymentProvider().verifyWebhookEvent("{}", "t=1,v1=abc")).toThrow("STRIPE_NOT_CONFIGURED");
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });
});

describe("StripePaymentProvider.listUndeliveredEvents [TM064]", () => {
  it("chama events.list com types e delivery_success=false (docs.stripe.com/webhooks/process-undelivered-events), auto-paginado", async () => {
    const autoPagingToArray = vi.fn().mockResolvedValue([{ id: "evt_1", type: "checkout.session.completed" }]);
    mocks.eventsList.mockReturnValue({ autoPagingToArray });

    const out = await new StripePaymentProvider().listUndeliveredEvents({ types: ["checkout.session.completed", "refund.created"] });

    expect(mocks.eventsList).toHaveBeenCalledWith({
      types: ["checkout.session.completed", "refund.created"],
      delivery_success: false,
    });
    expect(autoPagingToArray).toHaveBeenCalledWith({ limit: 200 });
    expect(out).toEqual([{ id: "evt_1", type: "checkout.session.completed" }]);
  });

  it("aceita um limite customizado para autoPagingToArray", async () => {
    const autoPagingToArray = vi.fn().mockResolvedValue([]);
    mocks.eventsList.mockReturnValue({ autoPagingToArray });

    await new StripePaymentProvider().listUndeliveredEvents({ types: ["refund.created"], limit: 50 });

    expect(autoPagingToArray).toHaveBeenCalledWith({ limit: 50 });
  });

  it("lança STRIPE_NOT_CONFIGURED sem segredo configurado", async () => {
    mocks.env.STRIPE_SECRET_KEY = "";
    await expect(new StripePaymentProvider().listUndeliveredEvents({ types: ["refund.created"] })).rejects.toThrow("STRIPE_NOT_CONFIGURED");
    expect(mocks.eventsList).not.toHaveBeenCalled();
  });
});
