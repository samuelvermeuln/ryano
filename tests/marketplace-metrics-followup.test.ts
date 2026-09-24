/**
 * TM086 (RNF-008) — 4 acompanhamento events emitted via schoolMetrics, no
 * token/secret/PII in the logged payload. Same convention/pattern as
 * tests/marketplace-metrics.test.ts (TM052), kept as a separate file so this
 * Onda's additions don't touch that already-verified Onda 1 test file.
 */
import { describe, expect, it, vi } from "vitest";
import { schoolMetrics } from "@/modules/school/infrastructure/metrics";

const FORBIDDEN_KEYS = ["token", "secret", "password", "paymentRef", "email", "name", "cardNumber", "cvv", "reason", "scope"];

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

describe("schoolMetrics — eventos de acompanhamento [TM086]", () => {
  it("marketplace.coach_invitation.accepted — só IDs, sem PII", () => {
    const payload = captureLog(() => schoolMetrics.marketplaceCoachInvitationAccepted({
      licenseId: "lic-1", engagementId: "eng-1", coachId: "coach-1",
    }));
    expect(payload.metric).toBe("marketplace.coach_invitation.accepted");
    assertNoSensitiveKeys(payload);
  });

  it("marketplace.adaptation.proposed — só IDs, sem motivo/reason (texto livre do coach)", () => {
    const payload = captureLog(() => schoolMetrics.marketplaceAdaptationProposed({
      licenseId: "lic-1", adaptationId: "adapt-1", workoutAssignmentId: "wa-1", coachId: "coach-1",
    }));
    expect(payload.metric).toBe("marketplace.adaptation.proposed");
    assertNoSensitiveKeys(payload);
  });

  it("marketplace.adaptation.decided — só IDs e a decisão (ACCEPTED/DECLINED), sem PII", () => {
    const payload = captureLog(() => schoolMetrics.marketplaceAdaptationDecided({
      licenseId: "lic-1", adaptationId: "adapt-1", decision: "ACCEPTED", coachId: "coach-1",
    }));
    expect(payload.metric).toBe("marketplace.adaptation.decided");
    expect(payload.decision).toBe("ACCEPTED");
    assertNoSensitiveKeys(payload);
  });

  it("marketplace.engagement.revoked — só IDs, sem PII", () => {
    const payload = captureLog(() => schoolMetrics.marketplaceEngagementRevoked({
      licenseId: "lic-1", engagementId: "eng-1", coachId: "coach-1",
    }));
    expect(payload.metric).toBe("marketplace.engagement.revoked");
    assertNoSensitiveKeys(payload);
  });

  it("nenhum dos 4 eventos aceita athleteId no payload (o convite/ajuste já é escopado pela licença, não precisa identificar o atleta no log)", () => {
    const payloads = [
      captureLog(() => schoolMetrics.marketplaceCoachInvitationAccepted({ licenseId: "lic-1", engagementId: "eng-1", coachId: "coach-1" })),
      captureLog(() => schoolMetrics.marketplaceAdaptationProposed({ licenseId: "lic-1", adaptationId: "adapt-1", workoutAssignmentId: "wa-1", coachId: "coach-1" })),
      captureLog(() => schoolMetrics.marketplaceAdaptationDecided({ licenseId: "lic-1", adaptationId: "adapt-1", decision: "DECLINED", coachId: "coach-1" })),
      captureLog(() => schoolMetrics.marketplaceEngagementRevoked({ licenseId: "lic-1", engagementId: "eng-1", coachId: "coach-1" })),
    ];
    for (const payload of payloads) {
      expect(Object.keys(payload).map((k) => k.toLowerCase())).not.toContain("athleteid");
    }
  });
});
