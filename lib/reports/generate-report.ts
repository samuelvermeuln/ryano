import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { renderReportElement } from "@/lib/reports/render-report-element";
import type { ReportRequest } from "@/lib/reports/types";

const REPORT_WIDTH = 1080;
const REPORT_HEIGHT = 1080;
const REPORT_FONT_WEIGHTS = [400, 500, 600, 700, 800] as const;

let reportFontPromise: Promise<ArrayBuffer> | null = null;

export async function generateReport(request: ReportRequest) {
  const fontData = await getReportFontData();
  const image = new ImageResponse(renderReportElement(request), {
    width: REPORT_WIDTH,
    height: REPORT_HEIGHT,
    fonts: REPORT_FONT_WEIGHTS.map((weight) => ({
      name: "Geist",
      data: fontData,
      style: "normal" as const,
      weight,
    })),
  });

  return Buffer.from(await image.arrayBuffer());
}

async function getReportFontData() {
  if (!reportFontPromise) {
    reportFontPromise = readFile(
      join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf"),
    ).then((buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  }

  return reportFontPromise;
}
