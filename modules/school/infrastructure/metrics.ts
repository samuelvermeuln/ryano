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
} as const;
