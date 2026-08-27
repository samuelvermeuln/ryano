import type { GarminDailySyncCheckTemplateData } from "@/lib/reports/types";
import { renderPremiumReport } from "@/lib/reports/templates/shared";

export function renderGarminDailySyncCheckTemplate(data: GarminDailySyncCheckTemplateData) {
  return renderPremiumReport({
    eyebrow: "Acompanhamento Garmin",
    title: data.title,
    subtitle: `${data.athleteName} · ${data.dateLabel}`,
    narrative: data.message,
    checklist: data.checklist,
    footer: data.footer,
    status: "warning",
  });
}
