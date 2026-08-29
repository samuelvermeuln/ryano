import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { renderReportElement } from "@/lib/reports/render-report-element";
import type { ReportRequest } from "@/lib/reports/types";
import { resolveAvatarImageForReport } from "@/server/users/avatar";

const LOGO_PRINCIPAL_PATH = join(process.cwd(), "public", "logo-principal.png");
const LOGO_MARK_PATH = join(process.cwd(), "public", "logo.png");

const REPORT_WIDTH = 1080;
const REPORT_HEIGHT = 1620;
const REPORT_FONT_WEIGHTS = [400, 500, 600, 700, 800] as const;

let reportFontPromise: Promise<ArrayBuffer> | null = null;
let logoPrincipalDataUriPromise: Promise<string> | null = null;
let logoMarkDataUriPromise: Promise<string> | null = null;

export async function generateReport(request: ReportRequest) {
  const [hydratedRequest, fontData, logoPrincipalSrc, logoMarkSrc] = await Promise.all([
    hydrateReportRequest(request),
    getReportFontData(),
    getLogoPrincipalDataUri(),
    getLogoMarkDataUri(),
  ]);
  const image = new ImageResponse(renderReportElement(hydratedRequest, { logoPrincipalSrc, logoMarkSrc }), {
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

async function hydrateReportRequest(request: ReportRequest): Promise<ReportRequest> {
  switch (request.template) {
    case "daily-garmin-summary":
      return {
        ...request,
        data: {
          ...request.data,
          athleteImage: await resolveAvatarImageForReport(request.data.athleteImage),
        },
      };
    case "post-activity-report":
      return {
        ...request,
        data: {
          ...request.data,
          athleteImage: await resolveAvatarImageForReport(request.data.athleteImage),
        },
      };
    case "garmin-daily-sync-check":
      return {
        ...request,
        data: {
          ...request.data,
          athleteImage: await resolveAvatarImageForReport(request.data.athleteImage),
        },
      };
    case "garmin-reconnect":
      return {
        ...request,
        data: {
          ...request.data,
          athleteImage: await resolveAvatarImageForReport(request.data.athleteImage),
        },
      };
    default:
      return request;
  }
}

async function getReportFontData() {
  if (!reportFontPromise) {
    reportFontPromise = readFile(
      join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf"),
    ).then((buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  }

  return reportFontPromise;
}

async function getLogoPrincipalDataUri() {
  if (!logoPrincipalDataUriPromise) {
    logoPrincipalDataUriPromise = readFile(LOGO_PRINCIPAL_PATH).then((buffer) => `data:image/png;base64,${buffer.toString("base64")}`);
  }

  return logoPrincipalDataUriPromise;
}

async function getLogoMarkDataUri() {
  if (!logoMarkDataUriPromise) {
    logoMarkDataUriPromise = readFile(LOGO_MARK_PATH).then((buffer) => `data:image/png;base64,${buffer.toString("base64")}`);
  }

  return logoMarkDataUriPromise;
}
