import { describe, expect, it } from "vitest";

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

const heartRateZones = [
  { label: "Zona 1", value: "12:30", ratio: 0.21, color: "#38BDF8" },
  { label: "Zona 2", value: "28:40", ratio: 0.49, color: "#34D399" },
  { label: "Zona 3", value: "11:10", ratio: 0.19, color: "#F59E0B" },
  { label: "Zona 4", value: "5:00", ratio: 0.09, color: "#FB7185" },
  { label: "Zona 5", value: "1:10", ratio: 0.02, color: "#A78BFA" },
];

describe("post-activity heart-rate zones", () => {
  it.each([
    ["natacao", "NATAÇÃO"],
    ["corrida", "CORRIDA"],
    ["ciclismo", "CICLISMO"],
    ["surf", "SURF"],
  ] as const)("renders a readable heart-rate-zone card for %s", (sport, sportLabel) => {
    const svg = renderPostActivityReportTemplate({
      ...singleActivity(sport),
      heartRateZones,
    });

    expect(svg).toContain("ZONAS DE FREQUÊNCIA CARDÍACA");
    expect(svg).toContain(sportLabel);
    expect(svg).toContain('data-heart-rate-zones="true"');
    expect(svg).toContain('<rect x="32" y="700" width="736" height="270"');
    expect(svg).toContain("Zona 1");
    expect(svg).toContain("28:40");
  });

  it("omits the section when the activity has no heart-rate-zone data", () => {
    const svg = renderPostActivityReportTemplate(singleActivity("corrida"));

    expect(svg).not.toContain('data-heart-rate-zones="true"');
  });

  it.each([
    ["triatlo", "TRIATHLON"],
    ["duatlo", "CICLISMO E CORRIDA"],
    ["swimrun", "NATAÇÃO E CORRIDA"],
  ] as const)("renders heart-rate zones for the %s combined-sport template", (combo, sportLabel) => {
    const svg = renderPostActivityReportTemplate({
      variant: "multi",
      combo,
      title: "Prova combinada",
      timeLabel: "Hoje, 07:00",
      athlete: { name: "Atleta" },
      totalStats: [],
      legs: [],
      secondaryMetrics: [],
      heartRateZones,
    });

    expect(svg).toContain('data-heart-rate-zones="true"');
    expect(svg).toContain(sportLabel);
  });
});
