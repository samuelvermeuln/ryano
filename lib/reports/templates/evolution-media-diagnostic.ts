import type { EvolutionMediaDiagnosticTemplateData } from "@/lib/reports/types";
import { renderPremiumReport } from "@/lib/reports/templates/shared";

export function renderEvolutionMediaDiagnosticTemplate(data: EvolutionMediaDiagnosticTemplateData) {
  return renderPremiumReport({
    eyebrow: "Evolution diagnostics",
    title: data.title,
    subtitle: data.subtitle,
    narrative: data.message,
    metrics: data.metrics,
    chart: data.chart,
    footer: data.footer,
    status: data.status,
  });
}
