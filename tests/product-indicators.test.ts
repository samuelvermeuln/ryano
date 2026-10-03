/**
 * SAM-80 — the seven product indicators (§24.1): definitions and arithmetic.
 */
import { describe, expect, it } from "vitest";

import {
  catalogUsage, eventsClosed, extrasReviewed, followUpsCovered, importAndPublishFailures, quantiles, timeToAssignBatch, timeToFirstAnalysis,
} from "@/modules/school/domain/product-indicators";

const at = (iso: string) => new Date(iso);

describe("indicadores do produto (§24.1)", () => {
  it("tempo até a primeira análise: mediana e p90 só das preparações iniciadas", () => {
    const view = timeToFirstAnalysis([
      { createdAt: at("2026-10-01T10:00:00Z"), startedAt: at("2026-10-01T12:00:00Z"), status: "PLANNING", coachId: "c", firstReviewLocalDate: null },
      { createdAt: at("2026-10-01T10:00:00Z"), startedAt: at("2026-10-02T10:00:00Z"), status: "ACTIVE", coachId: "c", firstReviewLocalDate: "2026-10-10" },
      { createdAt: at("2026-10-01T10:00:00Z"), startedAt: null, status: "UNASSIGNED", coachId: null, firstReviewLocalDate: null },
    ]);
    expect(view.numbers).toMatchObject({ analysed: 2, registered: 3, medianSeconds: 7200, p90Seconds: 86400 });
    expect(view.value).toContain("mediana 2 h");
    expect(quantiles([])).toEqual({ median: null, p90: null });
  });

  it("acompanhamentos abertos com responsável e com revisão marcada", () => {
    const view = followUpsCovered([
      { createdAt: at("2026-10-01T00:00:00Z"), startedAt: null, status: "UNASSIGNED", coachId: null, firstReviewLocalDate: null },
      { createdAt: at("2026-10-01T00:00:00Z"), startedAt: null, status: "PLANNING", coachId: "c", firstReviewLocalDate: null },
      { createdAt: at("2026-10-01T00:00:00Z"), startedAt: null, status: "ACTIVE", coachId: "c", firstReviewLocalDate: "2026-10-20" },
      { createdAt: at("2026-10-01T00:00:00Z"), startedAt: null, status: "CLOSED", coachId: "c", firstReviewLocalDate: "2026-09-01" },
    ]);
    expect(view.numbers).toMatchObject({ open: 3, withCoach: 2, withReview: 1, coachPct: 66.7, reviewPct: 33.3 });
  });

  it("tempo de atribuição em turma, uso do catálogo e adaptações", () => {
    const batches = [
      { createdAt: at("2026-10-01T10:00:00Z"), updatedAt: at("2026-10-01T10:00:40Z"), templateId: "t1", recipients: [{ status: "OK", overrides: { description: "mais leve" } }, { status: "OK", overrides: {} }, { status: "FAILED", overrides: null }] },
      { createdAt: at("2026-10-02T10:00:00Z"), updatedAt: at("2026-10-02T10:02:00Z"), templateId: null, recipients: [{ status: "OK", overrides: null }] },
    ];
    expect(timeToAssignBatch(batches).numbers).toMatchObject({ medianSeconds: 40, p90Seconds: 120, batches: 2 });
    const usage = catalogUsage([{ templateId: "t1" }, { templateId: "t1" }, { templateId: null }, { templateId: null }], batches);
    expect(usage.numbers).toMatchObject({ workouts: 4, fromCatalog: 2, catalogPct: 50, recipients: 4, adapted: 1, adaptedPct: 25 });
  });

  it("extras visíveis × tratadas; falhas e duplicidades; eventos com resultado e parecer", () => {
    expect(extrasReviewed([{ noticed: true, linkedLater: true, reportedByAthlete: false }, { noticed: true, linkedLater: false, reportedByAthlete: true }, { noticed: true, linkedLater: false, reportedByAthlete: false }, { noticed: false, linkedLater: false, reportedByAthlete: false }]).numbers)
      .toMatchObject({ visible: 3, handled: 2, pct: 66.7 });
    const failures = importAndPublishFailures({ duplicates: 2, failedWebhooks: 1, failedPushes: 1, failedRecipients: 3, totalRecipients: 30 });
    expect(failures.numbers).toMatchObject({ duplicates: 2, failures: 5, failedRecipientsPct: 10 });
    const events = eventsClosed([{ eventPassed: true, hasResult: true, hasReview: true }, { eventPassed: true, hasResult: true, hasReview: false }, { eventPassed: true, hasResult: false, hasReview: false }, { eventPassed: false, hasResult: false, hasReview: false }]);
    expect(events.numbers).toMatchObject({ passed: 3, withResult: 2, withReview: 1, resultPct: 66.7, reviewPct: 33.3 });
  });

  it("nenhum indicador carrega nome ou identificador de pessoa", () => {
    const views = [
      timeToFirstAnalysis([]), followUpsCovered([]), timeToAssignBatch([]), catalogUsage([], []), extrasReviewed([]),
      importAndPublishFailures({ duplicates: 0, failedWebhooks: 0, failedPushes: 0, failedRecipients: 0, totalRecipients: 0 }), eventsClosed([]),
    ];
    expect(views).toHaveLength(7);
    for (const view of views) {
      expect(Object.keys(view)).toEqual(["key", "title", "definition", "numerator", "denominator", "value", "numbers"]);
      expect(Object.values(view.numbers).every((value) => value === null || typeof value === "number")).toBe(true);
    }
  });
});
