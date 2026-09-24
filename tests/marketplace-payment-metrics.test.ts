/**
 * TM070 (RNF-008) — payment instrumentation (TM060/TM064/TM065/TM061): no
 * token, secret, card data, or payment reference in the logged payload.
 * Same pattern as `marketplace-metrics.test.ts` (TM052).
 */
import { describe, expect, it, vi } from "vitest";
import { schoolMetrics } from "@/modules/school/infrastructure/metrics";

const FORBIDDEN_KEYS = [
  "token", "secret", "password", "paymentref", "email", "name",
  "cardnumber", "cvv", "signature", "whsec", "clientsecret",
];
const FORBIDDEN_VALUE_PATTERNS = [/whsec_/i, /pi_/i, /re_[a-z0-9]/i, /sk_(test|live)_/i, /card|cvv/i];

function captureLog(fn: () => void): Record<string, unknown> {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    fn();
    const raw = spy.mock.calls[0]?.[0] as string;
    return JSON.parse(raw);
  } finally {
    spy.mockRestore();
  }
}

function assertNoSensitiveData(payload: Record<string, unknown>) {
  const keys = Object.keys(payload).map((k) => k.toLowerCase());
  for (const forbidden of FORBIDDEN_KEYS) {
    expect(keys).not.toContain(forbidden);
  }
  const serialized = JSON.stringify(payload);
  for (const pattern of FORBIDDEN_VALUE_PATTERNS) {
    expect(serialized).not.toMatch(pattern);
  }
}

describe("schoolMetrics — eventos de pagamento [TM070]", () => {
  it("marketplace.purchase.confirmed — só IDs e provider (string opaca), sem PII/segredo", () => {
    const payload = captureLog(() => schoolMetrics.marketplacePurchaseConfirmed({
      productId: "prod-1", purchaseId: "pur-1", licenseId: "lic-1", athleteId: "athlete-1", provider: "stripe",
    }));
    expect(payload.metric).toBe("marketplace.purchase.confirmed");
    assertNoSensitiveData(payload);
  });

  it("marketplace.refund.processed (evento de provedor) — sem PII/segredo", () => {
    const payload = captureLog(() => schoolMetrics.marketplaceRefundProcessed({
      purchaseId: "pur-1", reason: "provider_event",
    }));
    expect(payload.metric).toBe("marketplace.refund.processed");
    assertNoSensitiveData(payload);
  });

  it("marketplace.refund.processed (ação administrativa) — actorUserId é um ID opaco, não PII", () => {
    const payload = captureLog(() => schoolMetrics.marketplaceRefundProcessed({
      purchaseId: "pur-1", reason: "admin_action", actorUserId: "admin-1",
    }));
    assertNoSensitiveData(payload);
    expect(payload.actorUserId).toBe("admin-1");
  });

  it("marketplace.webhook.verification_failed — NUNCA vaza a assinatura ou o segredo do webhook (o caso mais sensível)", () => {
    const payload = captureLog(() => schoolMetrics.marketplaceWebhookVerificationFailed({ provider: "stripe" }));
    expect(payload.metric).toBe("marketplace.webhook.verification_failed");
    assertNoSensitiveData(payload);
    expect(Object.keys(payload).sort()).toEqual(["correlationId", "metric", "provider", "timestamp"].sort());
  });

  it("marketplace.reconciliation.run — só contagens agregadas, nunca IDs/payloads de evento individuais", () => {
    const payload = captureLog(() => schoolMetrics.marketplaceReconciliationRun({
      checked: 10, confirmed: 7, refunded: 2, alreadyProcessed: 1, failedCount: 0,
    }));
    expect(payload.metric).toBe("marketplace.reconciliation.run");
    assertNoSensitiveData(payload);
    expect(payload).toMatchObject({ checked: 10, confirmed: 7, refunded: 2, alreadyProcessed: 1, failedCount: 0 });
  });
});
