import { describe, expect, it } from "vitest";

import { renderAthleteDailyReadinessTemplate } from "@/lib/reports/templates/athlete-daily-readiness";

describe("athlete daily readiness typography", () => {
  it("uses the bundled report family and vector iconography", () => {
    const svg = renderAthleteDailyReadinessTemplate({
      sport: "triathlon",
      reportType: "RELATÓRIO TRIATHLON | PERFORMANCE",
      date: "04 SET 2026",
      athlete: { name: "MARINA", team: "RYVANO" },
      readiness: {
        score: 72,
        statusLabel: "RECUPERAÇÃO MODERADA",
        tone: "moderate",
        description: "Bom estado geral para treino moderado hoje.",
      },
      metrics: [
        { type: "sleep", icon: "moon", label: "SONO", value: 87, sub: "7h 56min", tone: "good" },
        { type: "battery", icon: "battery", label: "BODY BATTERY", from: 38, to: 88 },
        { type: "badge", icon: "hrv", label: "VFC", value: 73, unit: " ms", statusLabel: "NORMAL", tone: "good" },
        { type: "badge", icon: "hr", label: "FC", value: 50, unit: " bpm", statusLabel: "NORMAL", tone: "moderate" },
      ],
      recommendations: ["Treino moderado recomendado."],
    });

    expect(svg).toContain('font-family="Geist"');
    expect(svg).not.toMatch(/[📅🌙⚡💓❤️⭐✓≋]/u);
    expect(svg).toContain('stroke-linejoin="round"');
  });
});
