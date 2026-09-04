import { describe, expect, it } from "vitest";

import { ReportPage } from "@/lib/reports/render-report-components";

const palette = {
  pageBackground: "#fff",
  textPrimary: "#111",
  border: "#ddd",
  surface: "#fff",
} as never;

describe("ReportPage font family", () => {
  it("uses the exact family registered in ImageResponse", () => {
    const page = ReportPage({ palette, children: null });

    expect(page.props.style.fontFamily).toBe("Geist");
  });
});
