/**
 * T313 — Métricas de matching
 * T314 — Métricas de compliance
 *
 * Thin, side-effect-free metrics helper.
 * In production, replace the console.log body with your APM SDK
 * (e.g. Datadog, Prometheus push-gateway, OpenTelemetry).
 *
 * All functions are fire-and-forget: they never throw.
 */

type MatchOutcome = "auto_matched" | "confirmed" | "overridden" | "unmatched" | "conflict";

export type MatchMetricPayload = {
  outcome: MatchOutcome;
  matchScore?: number;
  schoolId?: string;
  athleteId?: string;
  correlationId?: string;
};

export type ComplianceMetricPayload = {
  overallScore: number;
  sportType?: string;
  schoolId?: string;
  athleteId?: string;
  correlationId?: string;
};

function emit(name: string, payload: Record<string, unknown>) {
  try {
    console.log(JSON.stringify({ metric: name, ...payload, timestamp: new Date().toISOString() }));
  } catch {
    // Never propagate metric errors into the request path
  }
}

export const schoolMetrics = {
  /** T313 — record one matching outcome with its score. */
  matchingOutcome(payload: MatchMetricPayload) {
    emit("escola.matching.outcome", {
      outcome: payload.outcome,
      matchScore: payload.matchScore ?? null,
      schoolId: payload.schoolId ?? null,
      athleteId: payload.athleteId ?? null,
      correlationId: payload.correlationId ?? null,
    });
  },

  /** T313 — record a matching failure (use case threw). */
  matchingError(reason: string, correlationId?: string) {
    emit("escola.matching.error", { reason, correlationId: correlationId ?? null });
  },

  /** T314 — record a computed compliance score. */
  complianceScore(payload: ComplianceMetricPayload) {
    emit("escola.compliance.score", {
      overallScore: payload.overallScore,
      overallScoreNormalized: +(payload.overallScore / 10).toFixed(2),
      sportType: payload.sportType ?? null,
      schoolId: payload.schoolId ?? null,
      athleteId: payload.athleteId ?? null,
      correlationId: payload.correlationId ?? null,
    });
  },

  /** T314 — record a compliance computation failure. */
  complianceError(reason: string, correlationId?: string) {
    emit("escola.compliance.error", { reason, correlationId: correlationId ?? null });
  },

  // TM052 (RNF-008) — 4 marketplace events. Payloads carry only opaque IDs
  // (already the convention above for schoolId/athleteId) — never token,
  // secret, payment reference, email, or name.
  /** TM022 — a coach published a new, now-immutable product version. */
  marketplaceProductPublished(payload: { productId: string; versionId: string; coachId?: string; schoolId?: string; correlationId?: string }) {
    emit("marketplace.product.published", {
      productId: payload.productId, versionId: payload.versionId,
      coachId: payload.coachId ?? null, schoolId: payload.schoolId ?? null,
      correlationId: payload.correlationId ?? null,
    });
  },

  /** TM038 — a free acquisition completed (purchase + license created). */
  marketplacePurchaseFreeCompleted(payload: { productId: string; purchaseId: string; licenseId: string; athleteId: string; correlationId?: string }) {
    emit("marketplace.purchase.free_completed", {
      productId: payload.productId, purchaseId: payload.purchaseId,
      licenseId: payload.licenseId, athleteId: payload.athleteId,
      correlationId: payload.correlationId ?? null,
    });
  },

  /** TM041 — a license was activated (calendar instantiated). */
  marketplaceLicenseActivated(payload: { licenseId: string; athleteId: string; mode: string; correlationId?: string }) {
    emit("marketplace.license.activated", {
      licenseId: payload.licenseId, athleteId: payload.athleteId, mode: payload.mode,
      correlationId: payload.correlationId ?? null,
    });
  },

  /** TM047 — a review was created or edited. */
  marketplaceReviewCreated(payload: { productId: string; reviewId: string; stars: number; correlationId?: string }) {
    emit("marketplace.review.created", {
      productId: payload.productId, reviewId: payload.reviewId, stars: payload.stars,
      correlationId: payload.correlationId ?? null,
    });
  },

  // TM086 (RNF-008) — Onda 3, 4 acompanhamento events. Same "opaque IDs only"
  // convention as the TM052 group above — never token/secret/paymentRef/PII.
  /** TM073 — an invited coach accepted a LicenseCoachEngagement (PENDING -> ACTIVE). */
  marketplaceCoachInvitationAccepted(payload: { licenseId: string; engagementId: string; coachId: string; correlationId?: string }) {
    emit("marketplace.coach_invitation.accepted", {
      licenseId: payload.licenseId, engagementId: payload.engagementId, coachId: payload.coachId,
      correlationId: payload.correlationId ?? null,
    });
  },

  /** TM074 — a coach proposed a PlanAdaptation on a WorkoutAssignment. */
  marketplaceAdaptationProposed(payload: { licenseId: string; adaptationId: string; workoutAssignmentId: string; coachId: string; correlationId?: string }) {
    emit("marketplace.adaptation.proposed", {
      licenseId: payload.licenseId, adaptationId: payload.adaptationId,
      workoutAssignmentId: payload.workoutAssignmentId, coachId: payload.coachId,
      correlationId: payload.correlationId ?? null,
    });
  },

  /** TM075 — the athlete accepted or declined a proposed PlanAdaptation. */
  marketplaceAdaptationDecided(payload: { licenseId: string; adaptationId: string; decision: "ACCEPTED" | "DECLINED"; coachId: string; correlationId?: string }) {
    emit("marketplace.adaptation.decided", {
      licenseId: payload.licenseId, adaptationId: payload.adaptationId, decision: payload.decision, coachId: payload.coachId,
      correlationId: payload.correlationId ?? null,
    });
  },

  /** TM076 — a LicenseCoachEngagement was revoked (PENDING/ACTIVE -> ENDED). */
  marketplaceEngagementRevoked(payload: { licenseId: string; engagementId: string; coachId: string; correlationId?: string }) {
    emit("marketplace.engagement.revoked", {
      licenseId: payload.licenseId, engagementId: payload.engagementId, coachId: payload.coachId,
      correlationId: payload.correlationId ?? null,
    });
  },

  // TM060/TM070 (Onda 2 — RNF-008) — payment events. Same opaque-IDs-only
  // convention; provider is a bare string ("stripe"), never a secret/token.
  /** TM060 — a paid purchase was confirmed by a verified webhook event. */
  marketplacePurchaseConfirmed(payload: { productId: string; purchaseId: string; licenseId: string; athleteId: string; provider: string; correlationId?: string }) {
    emit("marketplace.purchase.confirmed", {
      productId: payload.productId, purchaseId: payload.purchaseId, licenseId: payload.licenseId,
      athleteId: payload.athleteId, provider: payload.provider,
      correlationId: payload.correlationId ?? null,
    });
  },

  /** TM065 — a purchase was refunded (provider event or audited admin action). */
  marketplaceRefundProcessed(payload: { purchaseId: string; reason: "provider_event" | "admin_action"; actorUserId?: string; correlationId?: string }) {
    emit("marketplace.refund.processed", {
      purchaseId: payload.purchaseId, reason: payload.reason, actorUserId: payload.actorUserId ?? null,
      correlationId: payload.correlationId ?? null,
    });
  },

  /** TM061 — a webhook request failed signature verification (never logs the signature or secret). */
  marketplaceWebhookVerificationFailed(payload: { provider: string; correlationId?: string }) {
    emit("marketplace.webhook.verification_failed", {
      provider: payload.provider, correlationId: payload.correlationId ?? null,
    });
  },

  /** TM064 — one reconciliation run finished; counts only, never event payloads. */
  marketplaceReconciliationRun(payload: { checked: number; confirmed: number; refunded: number; alreadyProcessed: number; failedCount: number; correlationId?: string }) {
    emit("marketplace.reconciliation.run", {
      checked: payload.checked, confirmed: payload.confirmed, refunded: payload.refunded,
      alreadyProcessed: payload.alreadyProcessed, failedCount: payload.failedCount,
      correlationId: payload.correlationId ?? null,
    });
  },
} as const;
