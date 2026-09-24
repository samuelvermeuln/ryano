/**
 * TM064 (RF-203) — POST/GET /api/marketplace/reconcile-payments. Protegida
 * por MARKETPLACE_ADMIN_KEY (mesmo padrão de app/api/integrations/garmin/jobs),
 * nunca por sessão de usuário — não é uma rota voltada ao navegador.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listUndeliveredEvents: vi.fn(),
  confirmExecute: vi.fn(),
  refundExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: "true", MARKETPLACE_ADMIN_KEY: "secret-key" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/infrastructure/stripe-payment-provider", () => ({
  StripePaymentProvider: class { listUndeliveredEvents = mocks.listUndeliveredEvents; },
}));
vi.mock("@/modules/school/application/confirm-training-purchase-from-webhook", () => ({
  ConfirmTrainingPurchaseFromWebhook: class { execute = mocks.confirmExecute; },
}));
vi.mock("@/modules/school/application/refund-training-purchase", () => ({
  RefundTrainingPurchase: class { execute = mocks.refundExecute; },
}));

import { POST } from "@/app/api/marketplace/reconcile-payments/route";

function req(headers: Record<string, string> = { "x-admin-key": "secret-key" }) {
  return new Request("http://test/api/marketplace/reconcile-payments", { method: "POST", headers: new Headers(headers) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = "true";
  mocks.env.MARKETPLACE_ADMIN_KEY = "secret-key";
  mocks.listUndeliveredEvents.mockResolvedValue([]);
});

describe("POST /api/marketplace/reconcile-payments [TM064]", () => {
  it("sem x-admin-key/Authorization válidos: 401, nunca chama o provedor", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(mocks.listUndeliveredEvents).not.toHaveBeenCalled();
  });

  it("com x-admin-key correto: roda a reconciliação e retorna o resumo", async () => {
    mocks.listUndeliveredEvents.mockResolvedValue([
      { id: "evt_1", type: "checkout.session.completed", data: { object: {} } },
    ]);
    mocks.confirmExecute.mockResolvedValue({ handled: true, alreadyProcessed: false });

    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, checked: 1, confirmed: 1, failed: [] });
  });

  it("aceita Authorization: Bearer <chave> como alternativa a x-admin-key", async () => {
    const res = await POST(req({ authorization: "Bearer secret-key" }));
    expect(res.status).toBe(200);
  });

  it("404 quando o marketplace está desligado, mesmo com chave válida", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    mocks.env.SCHOOL_MODULE_ENABLED = "false";
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(mocks.listUndeliveredEvents).not.toHaveBeenCalled();
  });

  it("chave incorreta: 401", async () => {
    const res = await POST(req({ "x-admin-key": "wrong-key" }));
    expect(res.status).toBe(401);
  });
});
