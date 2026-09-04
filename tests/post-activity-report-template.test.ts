import { describe, expect, it } from "vitest";

import {
  buildPostActivityReportTemplateFromActivity,
  getPostActivityReportView,
  renderPostActivityWhatsappText,
  shouldIncludeWeeklySummary,
} from "@/lib/post-activity-report-template";

describe("post activity report template", () => {
  it("builds running template with ordered primary metrics", () => {
    const report = buildPostActivityReportTemplateFromActivity({
      sportType: "running",
      name: "Treino progressivo",
      durationSeconds: 2671,
      distanceMeters: 8400,
      averageHeartRate: 151,
      averagePace: 318,
      averageCadence: 168,
      elevationGain: 124,
    });

    expect(report.label).toBe("Corrida");
    expect(report.metrics.map((metric) => metric.label)).toEqual([
      "Distância",
      "Tempo",
      "Ritmo médio",
      "FC média",
    ]);
    expect(report.chips).toContain("Cadência 168 rpm");
    expect(report.insight).toContain("5:18 /km");
  });

  it("converts canonical cycling speed from m/s to km/h", () => {
    const report = buildPostActivityReportTemplateFromActivity({
      sportType: "cycling",
      name: "Pedal longo",
      durationSeconds: 3_600,
      distanceMeters: 30_000,
      averageSpeed: 8.33,
      averagePower: 212,
    });

    expect(report.metrics).toContainEqual({ label: "Velocidade média", value: "30,0 km/h" });
    expect(report.insight).toContain("30,0 km/h");
  });

  it("renders whatsapp text with stable sections", () => {
    const text = renderPostActivityWhatsappText({
      athleteName: "Rosa",
      occurredAt: "2026-08-20T06:57:00.000Z",
      report: {
        label: "Corrida",
        summary: "Treino registrado com 8,4 km · 44:31.",
        insight: "Ritmo médio de 5:18 /km com FC média de 151 bpm.",
        metrics: [
          { label: "Distância", value: "8,4 km" },
          { label: "Tempo", value: "44:31" },
        ],
        chips: ["Cadência 168 rpm", "Elevação 124 m"],
        weeklyTotalLabel: "3h 28min",
        weeklyComparison: "+6% em relação à semana anterior",
      },
    });

    expect(text).toContain("Olá, Rosa.");
    expect(text).toContain("Relatório pós-atividade");
    expect(text).toContain("Métricas principais");
    expect(text).toContain("• Distância: 8,4 km");
    expect(text).toContain("Destaque");
    expect(text).toContain("Leituras rápidas");
    expect(text).not.toContain("Leitura da semana");
  });

  it("shows weekly summary only on sunday and applies mobile limits", () => {
    const report = getPostActivityReportView(
      {
        label: "Corrida",
        summary: "Treino registrado com 8,4 km · 44:31.",
        insight: "Ritmo médio de 5:18 /km com FC média de 151 bpm.",
        metrics: [
          { label: "Distância", value: "8,4 km" },
          { label: "Tempo", value: "44:31" },
          { label: "Ritmo médio", value: "5:18 /km" },
          { label: "FC média", value: "151 bpm" },
        ],
        chips: ["Cadência 168 rpm", "Elevação 124 m", "FC 151 bpm"],
        weeklyTotalLabel: "3h 28min",
        weeklyComparison: "+6% em relação à semana anterior",
      },
      {
        occurredAt: "2026-08-23T08:00:00.000Z",
        surface: "landing-mobile",
      },
    );

    expect(shouldIncludeWeeklySummary("2026-08-23T08:00:00.000Z")).toBe(true);
    expect(shouldIncludeWeeklySummary("2026-08-20T08:00:00.000Z")).toBe(false);
    expect(report.showWeeklySummary).toBe(true);
    expect(report.metrics).toHaveLength(3);
    expect(report.chips).toHaveLength(2);
  });
});
