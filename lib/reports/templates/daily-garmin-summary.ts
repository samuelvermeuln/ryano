import type { DailyGarminSummaryTemplateData } from "@/lib/reports/types";
import { renderPremiumReport } from "@/lib/reports/templates/shared";

export function renderDailyGarminSummaryTemplate(data: DailyGarminSummaryTemplateData) {
  return renderPremiumReport({
    eyebrow: "Ryvano x Garmin",
    title: `Resumo fisiológico de ${data.athleteName}`,
    subtitle: data.dateLabel,
    narrative: data.overview,
    metrics: data.metrics,
    chart: data.chart,
    footer: `${data.footer} ${data.cta}`.trim(),
  });
}
