import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { generateReport } from "@/lib/reports/generate-report";

describe("generateReport", () => {
  it("rasterizes the post-activity SVG at its native WhatsApp dimensions", async () => {
    const image = await generateReport({
      template: "post-activity-report",
      data: {
        variant: "single",
        sport: "corrida",
        title: "Corrida de teste",
        place: "Parque",
        timeLabel: "Hoje, 06:15",
        athlete: { name: "Marina", photoUrl: null },
        heroStats: [
          { label: "DISTÂNCIA", value: "8,4", unit: "km" },
          { label: "TEMPO", value: "42:15", unit: "" },
        ],
        splits: [{ label: "Km 1", value: "5:00", seconds: 300 }],
        splitLabel: "Parciais",
        splitUnit: "/km",
        secondaryMetrics: [{ icon: "heart", label: "FC MÉDIA", value: "152", unit: "bpm" }],
      },
    });

    expect(await sharp(image).metadata()).toMatchObject({
      format: "png",
      width: 800,
      height: 1440,
    });
  });

  it("rasterizes daily readiness to a PNG before Evolution receives it", async () => {
    const image = await generateReport({
      template: "athlete-daily-readiness",
      data: {
        sport: "triathlon",
        reportType: "RELATÓRIO TRIATHLON | PERFORMANCE",
        date: "04 SET 2026",
        athlete: { name: "MARINA COSTA", team: "RYVANO ESPORTS DATA" },
        readiness: {
          score: 72,
          statusLabel: "RECUPERAÇÃO MODERADA",
          tone: "moderate",
          description: "Bom estado geral para treino moderado hoje.",
        },
        metrics: [
          { type: "sleep", icon: "moon", label: "SONO REGENERATIVO", value: 87, sub: "7h 56min", tone: "good" },
          { type: "battery", icon: "battery", label: "BODY BATTERY", from: 38, to: 88 },
        ],
        recommendations: ["Treino moderado recomendado."],
      },
    });

    expect(await sharp(image).metadata()).toMatchObject({
      format: "png",
      width: 800,
      height: 1124,
    });
  });
});
