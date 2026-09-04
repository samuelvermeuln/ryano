import { expect, describe, it, vi } from "vitest";

const { resvgOptions } = vi.hoisted(() => ({
  resvgOptions: [] as Array<{ font?: { loadSystemFonts?: boolean; fontFiles?: string[]; defaultFontFamily?: string } }>,
}));

vi.mock("@resvg/resvg-js", () => ({
  Resvg: class {
    constructor(_svg: string, options: { font?: { loadSystemFonts?: boolean; fontFiles?: string[]; defaultFontFamily?: string } }) {
      resvgOptions.push(options);
    }

    render() {
      return { asPng: () => Buffer.from("png") };
    }
  },
}));

import { generateReport } from "@/lib/reports/generate-report";

describe("post-activity report font configuration", () => {
  it("uses a bundled font instead of relying on fonts installed in the deployment image", async () => {
    await generateReport({
      template: "post-activity-report",
      data: {
        variant: "single",
        sport: "corrida",
        title: "Corrida",
        timeLabel: "Hoje",
        athlete: { name: "Marina", photoUrl: null },
        heroStats: [{ label: "TEMPO", value: "42:15", unit: "" }],
        splits: [{ label: "Km 1", value: "5:15", seconds: 315 }],
        splitLabel: "Parciais",
        splitUnit: "/km",
        secondaryMetrics: [],
      },
    });

    expect(resvgOptions).toHaveLength(1);
    expect(resvgOptions[0]?.font).toMatchObject({
      loadSystemFonts: false,
      defaultFontFamily: "Geist",
      fontFiles: [expect.stringMatching(/public\/fonts\/Geist-Regular\.ttf$/)],
    });
  });
});
