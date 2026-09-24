/**
 * TM061 (RF-202) — POST /api/marketplace/payment-webhook. Signature
 * verification happens BEFORE any database call (this task's own criterio).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyWebhookEvent: vi.fn(),
  confirmExecute: vi.fn(),
  refundExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: "true" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/infrastructure/stripe-payment-provider", () => ({
  StripePaymentProvider: class { verifyWebhookEvent = mocks.verifyWebhookEvent; },
}));
vi.mock("@/modules/school/application/confirm-training-purchase-from-webhook", () => ({
  ConfirmTrainingPurchaseFromWebhook: class { execute = mocks.confirmExecute; },
}));
vi.mock("@/modules/school/application/refund-training-purchase", () => ({
  RefundTrainingPurchase: class { execute = mocks.refundExecute; },
}));

import { POST } from "@/app/api/marketplace/payment-webhook/route";
import { SchoolError } from "@/modules/school/domain/errors";

function req(body: string, signature: string | null = "t=1,v1=abc") {
  const headers = new Headers();
  if (signature) headers.set("stripe-signature", signature);
  return new Request("http://test/api/marketplace/payment-webhook", { method: "POST", body, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = "true";
  mocks.confirmExecute.mockResolvedValue({ handled: true, alreadyProcessed: false });
});

describe("POST /api/marketplace/payment-webhook [TM061]", () => {
  it("sem header Stripe-Signature: rejeitado ANTES de verificar ou tocar o banco", async () => {
    const res = await POST(req("{}", null));
    expect(res.status).toBe(400);
    expect(mocks.verifyWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.confirmExecute).not.toHaveBeenCalled();
  });

  it("assinatura inválida: rejeitado ANTES de tocar o banco, nunca ecoa o erro cru da lib", async () => {
    mocks.verifyWebhookEvent.mockImplementation(() => { throw new Error("No signatures found matching the expected signature for payload — whsec_super_secret_value"); });
    const res = await POST(req("{}"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    expect(JSON.stringify(body)).not.toContain("whsec_super_secret_value");
    expect(mocks.confirmExecute).not.toHaveBeenCalled();
  });

  it("assinatura válida com checkout.session.completed: delega a ConfirmTrainingPurchaseFromWebhook", async () => {
    const event = { id: "evt_1", type: "checkout.session.completed", data: { object: {} } };
    mocks.verifyWebhookEvent.mockReturnValue(event);
    const res = await POST(req(JSON.stringify(event)));
    expect(res.status).toBe(200);
    expect(mocks.confirmExecute).toHaveBeenCalledWith(event);
    expect(mocks.refundExecute).not.toHaveBeenCalled();
  });

  it("refund.created: delega a RefundTrainingPurchase, não a ConfirmTrainingPurchaseFromWebhook", async () => {
    const event = { id: "evt_2", type: "refund.created", data: { object: { payment_intent: "pi_1" } } };
    mocks.verifyWebhookEvent.mockReturnValue(event);
    mocks.refundExecute.mockResolvedValue({ alreadyRefunded: false });
    const res = await POST(req(JSON.stringify(event)));
    expect(res.status).toBe(200);
    expect(mocks.refundExecute).toHaveBeenCalledWith({ kind: "provider_event", event });
    expect(mocks.confirmExecute).not.toHaveBeenCalled();
  });

  it("404 quando o marketplace está desligado — antes de qualquer verificação", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    mocks.env.SCHOOL_MODULE_ENABLED = "false";
    const res = await POST(req("{}"));
    expect(res.status).toBe(404);
    expect(mocks.verifyWebhookEvent).not.toHaveBeenCalled();
  });

  it("erro do caso de uso propaga o código/status do SchoolError", async () => {
    const event = { id: "evt_3", type: "checkout.session.completed", data: { object: {} } };
    mocks.verifyWebhookEvent.mockReturnValue(event);
    mocks.confirmExecute.mockRejectedValue(new SchoolError("PURCHASE_IDEMPOTENCY_CONFLICT", "mismatch"));
    const res = await POST(req(JSON.stringify(event)));
    expect(res.status).toBe(409);
  });
});
