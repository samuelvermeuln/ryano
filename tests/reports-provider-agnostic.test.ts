import { describe, expect, it } from "vitest";

import type { ProviderCapabilities } from "@/modules/shared/integrations/capabilities";
import {
  GENERIC_DELIVERY_PREFIXES,
  registerDeliveryMaterializer,
  resolveDeliveryMaterializer,
  type DeliveryMaterializer,
} from "@/modules/shared/reports/delivery";
import type { GarminDailySnapshot } from "@/modules/garmin/application/daily";
import { buildDailyGarminSummaryWhatsAppReport } from "@/server/services/report-builder";
import type { AthleteDailyReadinessTemplateData } from "@/lib/reports/types";

function buildFullSnapshot(): GarminDailySnapshot {
  return {
    date: "2025-02-10",
    fetchedAt: new Date("2025-02-10T08:00:00Z"),
    cached: false,
    summary: {
      steps: 8000,
      distanceMeters: 6000,
      totalKilocalories: 2400,
      activeKilocalories: 900,
      restingHeartRate: 48,
      bodyBatteryHighest: 90,
      bodyBatteryLowest: 20,
    },
    sleep: {
      durationSeconds: 27000,
      score: 82,
      avgSleepHrv: 60,
    },
    hrv: {
      lastNightAvg: 65,
      weeklyAvg: 62,
      status: "BALANCED",
    },
    readiness: {
      score: 78,
      level: "READY",
      recoveryTimeMinutes: 120,
      feedback: "Boa recuperação",
    },
    warnings: [],
  };
}

function getMetrics(report: ReturnType<typeof buildDailyGarminSummaryWhatsAppReport>) {
  return (report.request.data as AthleteDailyReadinessTemplateData).metrics;
}

describe("provider-agnostic daily report — capability-gated sections", () => {
  it("renders all physiological sections by default (Garmin behavior preserved)", () => {
    const report = buildDailyGarminSummaryWhatsAppReport({
      user: { name: "Ana Silva", image: null },
      snapshot: buildFullSnapshot(),
    });

    const types = getMetrics(report).map((metric) => metric.type);
    // sono, body battery e dois badges (VFC + FC repouso).
    expect(types).toContain("sleep");
    expect(types).toContain("battery");
    expect(types.filter((type) => type === "badge").length).toBe(2);
  });

  it("omits sections whose capability is not available, without failing", () => {
    // Provider hipotético que só fornece atividades/readiness (sem sleep/hrv/
    // recovery/dailyWellness): todas as seções fisiológicas correspondentes
    // devem ser omitidas — e o relatório continua sendo gerado (Req 9.2, 9.3).
    const capabilities: ProviderCapabilities = { activities: true, readiness: true };

    const report = buildDailyGarminSummaryWhatsAppReport({
      user: { name: "Ana Silva", image: null },
      snapshot: buildFullSnapshot(),
      capabilities,
    });

    expect(getMetrics(report)).toHaveLength(0);
    // O relatório em si permanece válido (readiness score presente).
    expect((report.request.data as AthleteDailyReadinessTemplateData).readiness.score).toBe(78);
  });

  it("renders only the sleep section when only sleep capability is present", () => {
    const report = buildDailyGarminSummaryWhatsAppReport({
      user: { name: "Ana Silva", image: null },
      snapshot: buildFullSnapshot(),
      capabilities: { sleep: true },
    });

    const types = getMetrics(report).map((metric) => metric.type);
    expect(types).toEqual(["sleep"]);
  });
});

describe("generic MessageDelivery type prefixes — backward-compatible resolver", () => {
  it("exposes provider-agnostic generic prefixes (no provider name)", () => {
    for (const prefix of Object.values(GENERIC_DELIVERY_PREFIXES)) {
      expect(prefix.toUpperCase()).not.toContain("GARMIN");
      expect(prefix.toUpperCase()).not.toContain("STRAVA");
    }
  });

  it("resolves both the generic prefix and its legacy alias to the same materializer", () => {
    const materializer: DeliveryMaterializer = async () => ({
      ok: false,
      errorCode: "TEST_ONLY",
    });
    const genericPrefix = "TEST_GENERIC_DELIVERY:";
    const legacyPrefix = "TEST_LEGACY_PROVIDER_DELIVERY:";

    registerDeliveryMaterializer(genericPrefix, materializer, {
      aliases: [legacyPrefix],
    });

    // Novo tipo genérico resolve.
    expect(resolveDeliveryMaterializer(`${genericPrefix}2025-02-10`)).toBe(materializer);
    // Tipo legado (entrega em andamento) ainda resolve para o mesmo materializador.
    expect(resolveDeliveryMaterializer(`${legacyPrefix}2025-02-10`)).toBe(materializer);
    // Tipo desconhecido não resolve.
    expect(resolveDeliveryMaterializer("UNKNOWN_DELIVERY_TYPE:x")).toBeNull();
  });
});
