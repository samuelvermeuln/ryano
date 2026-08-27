import type { GarminReconnectTemplateData } from "@/lib/reports/types";
import { renderPremiumReport } from "@/lib/reports/templates/shared";

export function renderGarminReconnectTemplate(data: GarminReconnectTemplateData) {
  return renderPremiumReport({
    eyebrow: "Integração Garmin",
    title: data.title,
    subtitle: data.athleteName,
    narrative: data.message,
    checklist: data.checklist,
    footer: data.footer,
    status: "warning",
  });
}
