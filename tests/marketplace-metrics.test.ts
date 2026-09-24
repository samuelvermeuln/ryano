/**
 * TM052 (RNF-008) — 4 marketplace events emitted via schoolMetrics, no
 * token/secret/PII in the logged payload.
 */
import { describe, expect, it, vi } from "vitest";
import { schoolMetrics } from "@/modules/school/infrastructure/metrics";

const FORBIDDEN_KEYS = ["token", "secret", "password", "paymentRef", "email", "name", "cardNumber", "cvv"];

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

function assertNoSensitiveKeys(payload: Record<string, unknown>) {
  const keys = Object.keys(payload).map((k) => k.toLowerCase());
  for (const forbidden of FORBIDDEN_KEYS) {
    expect(keys).not.toContain(forbidden.toLowerCase());
  }
}

describe("schoolMetrics — eventos do marketplace [TM052]", () => {
  it("marketplace.product.published — só IDs, sem PII", () => {
    const payload = captureLog(() => schoolMetrics.marketplaceProductPublished({
      productId: "prod-1", versionId: "ver-1", coachId: "coach-1",
    }));
    expect(payload.metric).toBe("marketplace.product.published");
    assertNoSensitiveKeys(payload);
  });

  it("marketplace.purchase.free_completed — só IDs, sem PII", () => {
    const payload = captureLog(() => schoolMetrics.marketplacePurchaseFreeCompleted({
      productId: "prod-1", purchaseId: "pur-1", licenseId: "lic-1", athleteId: "athlete-1",
    }));
    expect(payload.metric).toBe("marketplace.purchase.free_completed");
    assertNoSensitiveKeys(payload);
  });

  it("marketplace.license.activated — só IDs, sem PII", () => {
    const payload = captureLog(() => schoolMetrics.marketplaceLicenseActivated({
      licenseId: "lic-1", athleteId: "athlete-1", mode: "START_NOW",
    }));
    expect(payload.metric).toBe("marketplace.license.activated");
    assertNoSensitiveKeys(payload);
  });

  it("marketplace.review.created — só IDs, sem PII", () => {
    const payload = captureLog(() => schoolMetrics.marketplaceReviewCreated({
      productId: "prod-1", reviewId: "review-1", stars: 5,
    }));
    expect(payload.metric).toBe("marketplace.review.created");
    assertNoSensitiveKeys(payload);
  });
});
