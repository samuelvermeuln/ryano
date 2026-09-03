import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

import { renderPostActivityReportTemplate } from "@/lib/reports/templates/post-activity-report";
import type { PostActivityReportTemplateData } from "@/lib/reports/types";

function singleActivity(sport: "natacao" | "corrida" | "ciclismo" | "surf"): PostActivityReportTemplateData {
  return {
    variant: "single",
    sport,
    title: "Atividade concluída",
    timeLabel: "Hoje, 07:00",
    athlete: { name: "Atleta" },
    heroStats: [],
    splitLabel: "Parciais",
    splitUnit: "/km",
    splits: [],
    secondaryMetrics: [],
  };
}

describe("post activity recommendation watermark", () => {
  it("uses the swimmer image in the recommendation section", () => {
    const svg = renderPostActivityReportTemplate(singleActivity("natacao"));

    expect(svg).toContain("RECOMENDAÇÃO DO DIA");
    expect(svg).toContain('data-recommendation-watermark="nadador"');
    expect(svg).toContain('href="data:image/png;base64,');
  });

  it("renders the embedded watermark as a PNG for WhatsApp delivery", async () => {
    const svg = renderPostActivityReportTemplate(singleActivity("ciclismo"));
    const image = await sharp(Buffer.from(svg)).png().toBuffer();

    expect(image.length).toBeGreaterThan(0);
  });

  it("places the recommendation section below the secondary metric cards", () => {
    const data = singleActivity("corrida");
    data.secondaryMetrics = [
      { icon: "heart", label: "FC MÉDIA", value: "152", unit: "bpm" },
      { icon: "heartpulse", label: "FC MÁXIMA", value: "171", unit: "bpm" },
      { icon: "trending", label: "CADÊNCIA", value: "172", unit: "spm" },
      { icon: "flame", label: "CALORIAS", value: "612", unit: "kcal" },
    ];
    const svg = renderPostActivityReportTemplate(data);

    expect(svg.indexOf('x="32" y="1050"')).toBeLessThan(svg.indexOf('x="32" y="1144"'));
  });

  it("uses the combined swimming and running image for swimrun", () => {
    const svg = renderPostActivityReportTemplate({
      variant: "multi",
      combo: "swimrun",
      title: "Swimrun concluído",
      timeLabel: "Hoje, 07:00",
      athlete: { name: "Atleta" },
      totalStats: [],
      legs: [],
      secondaryMetrics: [],
    });

    expect(svg).toContain('data-recommendation-watermark="natacao_corrida"');
  });

  it("renders multisport legs as compact modality splits", () => {
    const svg = renderPostActivityReportTemplate({
      variant: "multi",
      combo: "triatlo",
      title: "Triathlon concluído",
      timeLabel: "Hoje, 07:00",
      athlete: { name: "Atleta" },
      totalStats: [],
      legs: [
        { type: "activity", sport: "natacao", distance: "750 m", time: "14:00", pace: "1:52 /100 m" },
        { type: "activity", sport: "ciclismo", distance: "20 km", time: "35:00", pace: "34,3 km/h" },
        { type: "activity", sport: "corrida", distance: "5 km", time: "22:30", pace: "4:30 /km" },
      ],
      secondaryMetrics: [],
    });

    expect(svg).toContain("PARCIAIS POR MODALIDADE");
    expect(svg).toContain("750 m");
    expect(svg).toContain("14:00");
    expect(svg).toContain("1:52 /100 m");
    expect(svg).not.toContain("Tempo:");
  });

  it("keeps multisport partial labels visible after PNG rasterization", async () => {
    const svg = renderPostActivityReportTemplate({
      variant: "multi",
      combo: "duatlo",
      title: "Duathlon concluído",
      timeLabel: "Hoje, 07:00",
      athlete: { name: "Atleta" },
      totalStats: [],
      legs: [{ type: "activity", sport: "corrida", distance: "5 km", time: "21:50", pace: "4:22 /km" }],
      secondaryMetrics: [],
    });
    const { data } = await sharp(new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng())
      .extract({ left: 80, top: 380, width: 300, height: 28 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const darkPixels = Array.from(data).filter((_, index) => index % 4 === 0).filter((_, pixelIndex) => {
      const offset = pixelIndex * 4;
      return data[offset] < 100 && data[offset + 1] < 120 && data[offset + 2] < 150;
    });

    expect(darkPixels.length).toBeGreaterThan(20);
  });

  it("uses the Ryvano logo when the modality does not have a specific image", () => {
    const svg = renderPostActivityReportTemplate(singleActivity("surf"));

    expect(svg).toContain('data-recommendation-watermark="logo-principal"');
  });
});
