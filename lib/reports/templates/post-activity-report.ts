import type { PostActivityReportTemplateData } from "@/lib/reports/types";
import { renderPremiumReport } from "@/lib/reports/templates/shared";

export function renderPostActivityReportTemplate(data: PostActivityReportTemplateData) {
  return renderPremiumReport({
    eyebrow: "Ryvano performance",
    title: `${data.activityLabel} finalizada`,
    subtitle: `${data.athleteName} · ${data.occurredAtLabel}`,
    narrative: `${data.summary} ${data.insight}`.trim(),
    metrics: data.metrics,
    checklist: data.chips,
    chart: data.chart,
    footer: [data.footer, data.cta].filter(Boolean).join(" "),
  });
}
