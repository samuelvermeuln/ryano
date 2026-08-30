import type { ReportChart, ReportMetric } from "@/lib/reports/types";

import type {
  ChartPalette,
  DailyWhatsappMetricCardData,
  ReportFrame,
  ReportPalette,
} from "./render-report-types";

export function getPrimaryMetric(metrics: ReportMetric[]) {
  return metrics.find((metric) => normalizeLabel(metric.label).includes("prontid")) ?? metrics[0] ?? null;
}

export function getPointBarColor(
  point: ReportChart["data"][number],
  index: number,
  chartPalette: ChartPalette,
  palette: ReportPalette,
) {
  if (point.tone === "warning") {
    return palette.warning;
  }

  if (point.tone === "neutral") {
    return chartPalette.neutral;
  }

  const cycle = [chartPalette.primary, chartPalette.secondary, chartPalette.tertiary];
  return cycle[index % cycle.length] ?? chartPalette.primary;
}

export function splitMetricValue(value: string) {
  const slashIndex = value.indexOf("/");

  if (slashIndex === -1) {
    return [value, ""] as const;
  }

  return [value.slice(0, slashIndex), value.slice(slashIndex)] as const;
}

export function getMetricInterpretation(metric: ReportMetric | null | undefined) {
  if (!metric) {
    return "Leitura principal pronta para interpretação.";
  }

  if (metric.tone === "warning") {
    return "Leitura abaixo da faixa ideal no momento.";
  }

  if (metric.tone === "accent") {
    return "Leitura consistente para sustentar boa tomada de decisão.";
  }

  return "Leitura intermediária, pedindo contexto antes de ajustar carga.";
}

export function buildDailyChecklist(metrics: ReportMetric[]) {
  const readiness = metrics.find((metric) => normalizeLabel(metric.label).includes("prontid"));
  const sleep = metrics.find((metric) => normalizeLabel(metric.label).includes("sleep") || normalizeLabel(metric.label).includes("sono"));
  const battery = metrics.find((metric) => normalizeLabel(metric.label).includes("battery"));

  return [
    readiness?.tone === "warning"
      ? "Priorize recuperação e evite intensidade alta se a percepção subjetiva confirmar fadiga."
      : readiness?.tone === "accent"
        ? "Pode avançar com sessão moderada se sensação corporal e agenda do dia estiverem favoráveis."
        : "Prefira carga controlada e reavalie resposta ao longo do dia.",
    sleep?.tone === "warning"
      ? "Sono pede atenção antes de aumentar carga, principalmente em treino-chave."
      : "Recuperação noturna trouxe base útil para decisões mais seguras no treino.",
    battery?.tone === "warning"
      ? "Monitore energia percebida e reduza volume se houver queda ao longo do dia."
      : "Observe energia, sinais musculares e resposta cardiovascular para refinar a sessão.",
  ];
}

export function buildActivityChecklist(frame: ReportFrame) {
  return [
    `Modalidade em foco: ${getSportBadgeLabel(frame)}.`,
    "Use este card para leitura rápida antes de abrir análise detalhada.",
    "Compare sensação subjetiva com as métricas centrais da sessão.",
  ];
}

export function getSportBadgeLabel(frame: ReportFrame) {
  const sport = frame.theme.sport ?? "default";

  if (sport === "open-water") {
    return "Águas abertas";
  }

  if (sport === "mtb") {
    return "MTB";
  }

  if (sport === "trail-run") {
    return "Trail run";
  }

  if (sport === "stand-up-paddle") {
    return "Stand up paddle";
  }

  if (sport === "crossfit") {
    return "CrossFit";
  }

  if (sport === "gym") {
    return "Força";
  }

  if (sport === "football") {
    return "Futebol";
  }

  if (sport === "futsal") {
    return "Futsal";
  }

  if (sport === "basketball") {
    return "Basquete";
  }

  if (sport === "volleyball") {
    return "Vôlei";
  }

  if (sport === "tennis") {
    return "Tênis";
  }

  if (sport === "padel") {
    return "Padel";
  }

  if (sport === "rowing") {
    return "Remo";
  }

  if (sport === "kayak") {
    return "Caiaque";
  }

  if (sport === "swim") {
    return "Natação";
  }

  if (sport === "bike") {
    return "Bike";
  }

  if (sport === "run") {
    return "Corrida";
  }

  if (sport === "walking") {
    return "Caminhada";
  }

  if (sport === "hiking") {
    return "Hiking";
  }

  if (sport === "triathlon") {
    return "Triathlon";
  }

  if (sport === "duathlon") {
    return "Duathlon";
  }

  if (sport === "aquathlon") {
    return "Aquathlon";
  }

  if (sport === "surf") {
    return "Surf";
  }

  return frame.family === "activity" ? "Performance" : "Ryvano";
}

export function getFooterText(frame: ReportFrame) {
  const cleaned = cleanFooter(frame.footer);

  if (cleaned) {
    return cleaned;
  }

  if (frame.family === "daily") {
    return "Dados que guiam. Performance que evolui.";
  }

  if (frame.family === "activity") {
    return "Leitura visual premium da sessão com foco no que realmente importa.";
  }

  if (frame.family === "warning") {
    return "Atualização operacional pronta para ação com leitura rápida e clara.";
  }

  if (frame.family === "reconnect") {
    return "Reconexão orientada para restaurar integração e continuidade dos relatórios.";
  }

  return "Mesmo motor visual dos cards reais para validar renderização e mídia final.";
}

export function cleanNarrative(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

export function cleanFooter(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const cleaned = value
    .replace(/https?:\/\/\S+/g, "")
    .replace(/Painel completo:/gi, "")
    .replace(/Conferir integração:/gi, "")
    .replace(/Acesso direto para revalidar integração:/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

export function getReportMetricByLabels(metrics: ReportMetric[], labels: string[]) {
  return metrics.find((metric) => labels.some((label) => normalizeLabel(metric.label).includes(label)));
}

export function parseScoreValue(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const match = value.match(/(\d{1,3})/);

  return match ? clampPercentage(Number(match[1])) : 0;
}

export function parseBodyBatteryRange(value: string | null | undefined) {
  if (!value) {
    return { from: null, to: null };
  }

  const matches = value.match(/\d+/g)?.map(Number) ?? [];

  if (matches.length >= 2) {
    return { from: matches[0], to: matches[1] };
  }

  if (matches.length === 1) {
    return { from: null, to: matches[0] };
  }

  return { from: null, to: null };
}

export function formatBadgeValue(value: number | null | undefined, unit: string) {
  return value === null || value === undefined ? "—" : `${Math.round(value)} ${unit}`;
}

export function clampPercentage(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (!parts.length) {
    return "RY";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function normalizeLabel(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function withOpacity(hex: string, opacity: number) {
  const normalized = hex.replace("#", "");
  const safe = normalized.length === 3
    ? normalized.split("").map((value) => `${value}${value}`).join("")
    : normalized;
  const red = Number.parseInt(safe.slice(0, 2), 16);
  const green = Number.parseInt(safe.slice(2, 4), 16);
  const blue = Number.parseInt(safe.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

export function assertNever(value: never): never {
  throw new Error(`Template não suportado: ${JSON.stringify(value)}`);
}
