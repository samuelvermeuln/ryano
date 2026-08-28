import sharp from "sharp";

import type { ReportRequest } from "@/lib/reports/types";
import { renderDailyGarminSummaryTemplate } from "@/lib/reports/templates/daily-garmin-summary";
import { renderEvolutionMediaDiagnosticTemplate } from "@/lib/reports/templates/evolution-media-diagnostic";
import { renderGarminDailySyncCheckTemplate } from "@/lib/reports/templates/garmin-daily-sync-check";
import { renderGarminReconnectTemplate } from "@/lib/reports/templates/garmin-reconnect";
import { renderPostActivityReportTemplate } from "@/lib/reports/templates/post-activity-report";

export async function generateReport(request: ReportRequest) {
  const svg = getTemplateSvg(request);

  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, quality: 100 })
    .toBuffer();
}

function getTemplateSvg(request: ReportRequest) {
  switch (request.template) {
    case "daily-garmin-summary":
      return renderDailyGarminSummaryTemplate(request.data);
    case "post-activity-report":
      return renderPostActivityReportTemplate(request.data);
    case "garmin-daily-sync-check":
      return renderGarminDailySyncCheckTemplate(request.data);
    case "garmin-reconnect":
      return renderGarminReconnectTemplate(request.data);
    case "evolution-media-diagnostic":
      return renderEvolutionMediaDiagnosticTemplate(request.data);
    default:
      return assertNever(request);
  }
}

function assertNever(value: never): never {
  throw new Error(`Template não suportado: ${JSON.stringify(value)}`);
}
