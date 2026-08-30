import type { ReportBrandAssets } from "./render-report-types";
import type { ReportRequest } from "@/lib/reports/types";

import { DailyGarminSummaryWhatsappCanvas } from "./daily-whatsapp-canvas";
import {
  ActivityReportCanvas,
  DailyReportCanvas,
  OperationalReportCanvas,
} from "./render-report-canvases";
import { getReportPalette, toReportFrame } from "./render-report-frame";

export function renderReportElement(request: ReportRequest, brand: ReportBrandAssets) {
  if (request.template === "daily-garmin-summary") {
    return <DailyGarminSummaryWhatsappCanvas data={request.data} brand={brand} />;
  }

  const frame = toReportFrame(request);
  const palette = getReportPalette(frame);

  if (frame.family === "daily") {
    return <DailyReportCanvas frame={frame} palette={palette} brand={brand} />;
  }

  if (frame.family === "activity") {
    return <ActivityReportCanvas frame={frame} palette={palette} brand={brand} />;
  }

  return <OperationalReportCanvas frame={frame} palette={palette} brand={brand} />;
}
