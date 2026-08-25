import { humanizeActivityLabel } from "@/lib/activity-text";
import {
  formatCadence,
  formatCalories,
  formatDistance,
  formatDurationClock,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatPower,
  formatSpeed,
  formatSwimPace,
} from "@/lib/format";
import { getSportLabel, type Sport } from "@/lib/sports";

export const POST_ACTIVITY_REPORT_RULES = {
  maxMetrics: 4,
  maxChips: 3,
  mobileMaxMetrics: 3,
  mobileMaxChips: 2,
  weeklySummaryDay: 0,
} as const;

export type PostActivityReportMetric = {
  label: string;
  value: string;
};

export type PostActivityReportTemplate = {
  label: string;
  summary: string;
  insight: string;
  metrics: readonly PostActivityReportMetric[];
  chips: readonly string[];
  weeklyTotalLabel?: string;
  weeklyComparison?: string;
  userReply?: string;
  assistantFollowUp?: string;
};

export type PostActivityReportSurface = "whatsapp" | "landing" | "landing-mobile";

export type PostActivityReportView = PostActivityReportTemplate & {
  metrics: readonly PostActivityReportMetric[];
  chips: readonly string[];
  showWeeklySummary: boolean;
};

type ActivityTemplateInput = {
  sportType: string;
  name?: string | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  calories?: number | null;
  averageHeartRate?: number | null;
  averagePace?: number | null;
  averageSpeed?: number | null;
  elevationGain?: number | null;
  averageCadence?: number | null;
  averagePower?: number | null;
};

export function buildPostActivityReportTemplateFromActivity(activity: ActivityTemplateInput): PostActivityReportTemplate {
  const sport = resolvePostActivitySport(activity.sportType);
  const label = sport ? getSportLabel(sport) : humanizeSportType(activity.sportType);
  const metrics = getTemplateMetrics(activity, sport);
  const chips = getTemplateChips(activity, sport);

  return {
    label,
    summary: buildSummary(activity, label),
    insight: buildInsight(activity, label, sport),
    metrics,
    chips,
  };
}

export function renderPostActivityWhatsappText(input: {
  athleteName?: string | null;
  report: PostActivityReportTemplate;
  occurredAt?: Date | string | null;
}) {
  const greetingName = input.athleteName?.trim() ? input.athleteName.trim() : "atleta";
  const reportView = getPostActivityReportView(input.report, {
    occurredAt: input.occurredAt,
    surface: "whatsapp",
  });
  const metricLines = reportView.metrics.map((metric) => `• ${metric.label}: ${metric.value}`);
  const chipLines = reportView.chips.map((chip) => `• ${chip}`);

  return [
    `Olá, ${greetingName}.`,
    "Relatório pós-atividade",
    `${reportView.label} concluída.`,
    reportView.summary,
    metricLines.length > 0 ? ["", "Métricas principais", ...metricLines].join("\n") : null,
    reportView.insight ? ["", "Destaque", reportView.insight].join("\n") : null,
    reportView.showWeeklySummary && reportView.weeklyTotalLabel
      ? [
          "",
          "Leitura da semana",
          `• Volume: ${reportView.weeklyTotalLabel}`,
          reportView.weeklyComparison ? `• Comparação: ${reportView.weeklyComparison}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : null,
    chipLines.length > 0 ? ["", "Leituras rápidas", ...chipLines].join("\n") : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getPostActivityReportView(
  report: PostActivityReportTemplate,
  context?: {
    occurredAt?: Date | string | null;
    surface?: PostActivityReportSurface;
  },
): PostActivityReportView {
  const surface = context?.surface ?? "landing";
  const metricsLimit = surface === "landing-mobile" ? POST_ACTIVITY_REPORT_RULES.mobileMaxMetrics : POST_ACTIVITY_REPORT_RULES.maxMetrics;
  const chipsLimit = surface === "landing-mobile" ? POST_ACTIVITY_REPORT_RULES.mobileMaxChips : POST_ACTIVITY_REPORT_RULES.maxChips;
  const showWeeklySummary = shouldIncludeWeeklySummary(context?.occurredAt);

  return {
    ...report,
    metrics: report.metrics.slice(0, metricsLimit),
    chips: report.chips.slice(0, chipsLimit),
    weeklyTotalLabel: showWeeklySummary ? report.weeklyTotalLabel : undefined,
    weeklyComparison: showWeeklySummary ? report.weeklyComparison : undefined,
    showWeeklySummary: showWeeklySummary && Boolean(report.weeklyTotalLabel),
  };
}

export function shouldIncludeWeeklySummary(occurredAt?: Date | string | null) {
  if (!occurredAt) {
    return false;
  }

  const date = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getDay() === POST_ACTIVITY_REPORT_RULES.weeklySummaryDay;
}

export function resolvePostActivitySport(sportType: string): Sport | null {
  const normalized = sportType.trim().toLowerCase();

  if (normalized.includes("tri")) {
    return "triathlon";
  }

  if (normalized.includes("swim") || normalized.includes("nat")) {
    return "swim";
  }

  if (normalized.includes("bike") || normalized.includes("cycl") || normalized.includes("ride") || normalized.includes("bik")) {
    return "bike";
  }

  if (normalized.includes("run") || normalized.includes("corr")) {
    return "run";
  }

  return null;
}

function getTemplateMetrics(activity: ActivityTemplateInput, sport: Sport | null) {
  const metrics: PostActivityReportMetric[] = [];

  const pushMetric = (label: string, value: string | null) => {
    if (value && value !== "—" && metrics.length < POST_ACTIVITY_REPORT_RULES.maxMetrics) {
      metrics.push({ label, value });
    }
  };

  if (sport === "swim") {
    pushMetric("Distância", formatDistance(activity.distanceMeters));
    pushMetric("Tempo", formatDurationClock(activity.durationSeconds));
    pushMetric("Ritmo médio", formatSwimPace(activity.averagePace));
    pushMetric("FC média", formatHeartRate(activity.averageHeartRate));
    return metrics;
  }

  if (sport === "bike") {
    pushMetric("Distância", formatDistance(activity.distanceMeters));
    pushMetric("Tempo", formatDurationClock(activity.durationSeconds));
    pushMetric("Velocidade média", formatSpeed(activity.averageSpeed));
    pushMetric("Potência média", formatPower(activity.averagePower));
    pushMetric("FC média", formatHeartRate(activity.averageHeartRate));
    return metrics;
  }

  if (sport === "run") {
    pushMetric("Distância", formatDistance(activity.distanceMeters));
    pushMetric("Tempo", formatDurationClock(activity.durationSeconds));
    pushMetric("Ritmo médio", formatPace(activity.averagePace));
    pushMetric("FC média", formatHeartRate(activity.averageHeartRate));
    pushMetric("Cadência", formatCadence(activity.averageCadence));
    return metrics;
  }

  pushMetric("Tempo", formatDurationClock(activity.durationSeconds));
  pushMetric("Distância", formatDistance(activity.distanceMeters));
  pushMetric("FC média", formatHeartRate(activity.averageHeartRate));
  pushMetric("Elevação", formatElevation(activity.elevationGain));
  pushMetric("Calorias", formatCalories(activity.calories));

  return metrics;
}

function getTemplateChips(activity: ActivityTemplateInput, sport: Sport | null) {
  const chips: string[] = [];

  const pushChip = (label: string, value: string | null) => {
    if (value && value !== "—" && chips.length < POST_ACTIVITY_REPORT_RULES.maxChips) {
      chips.push(`${label} ${value}`);
    }
  };

  if (sport === "swim") {
    pushChip("Ritmo", formatSwimPace(activity.averagePace));
    pushChip("FC", formatHeartRate(activity.averageHeartRate));
    pushChip("Calorias", formatCalories(activity.calories));
    return chips;
  }

  if (sport === "bike") {
    pushChip("Potência", formatPower(activity.averagePower));
    pushChip("Cadência", formatCadence(activity.averageCadence));
    pushChip("Elevação", formatElevation(activity.elevationGain));
    return chips;
  }

  if (sport === "run") {
    pushChip("Cadência", formatCadence(activity.averageCadence));
    pushChip("FC", formatHeartRate(activity.averageHeartRate));
    pushChip("Elevação", formatElevation(activity.elevationGain));
    return chips;
  }

  pushChip("Velocidade", formatSpeed(activity.averageSpeed));
  pushChip("Calorias", formatCalories(activity.calories));
  pushChip("Elevação", formatElevation(activity.elevationGain));
  return chips;
}

function buildSummary(activity: ActivityTemplateInput, label: string) {
  const fragments = [
    activity.name?.trim() ? `${activity.name.trim()} registrada` : `${label} registrada`,
    formatDistance(activity.distanceMeters),
    formatDurationClock(activity.durationSeconds),
  ].filter((value) => value && value !== "—");

  if (fragments.length <= 1) {
    return `Seu treino de ${label.toLowerCase()} já está pronto para revisão no WhatsApp.`;
  }

  const [headline, ...values] = fragments;
  return `${headline} com ${values.join(" · ")}.`;
}

function buildInsight(activity: ActivityTemplateInput, label: string, sport: Sport | null) {
  if (sport === "swim" && activity.averagePace) {
    return `Ritmo médio de ${formatSwimPace(activity.averagePace)} com leitura pronta para revisar logo após sair da água.`;
  }

  if (sport === "bike") {
    if (activity.averageSpeed) {
      return `Velocidade média de ${formatSpeed(activity.averageSpeed)}${activity.averagePower ? ` e potência média de ${formatPower(activity.averagePower)}` : ""}.`;
    }

    if (activity.averagePower) {
      return `Potência média de ${formatPower(activity.averagePower)} registrada no pedal.`;
    }
  }

  if (sport === "run" && activity.averagePace) {
    return `Ritmo médio de ${formatPace(activity.averagePace)}${activity.averageHeartRate ? ` com FC média de ${formatHeartRate(activity.averageHeartRate)}` : ""}.`;
  }

  if (activity.averageHeartRate) {
    return `FC média de ${formatHeartRate(activity.averageHeartRate)} em um treino de ${label.toLowerCase()}.`;
  }

  if (activity.distanceMeters) {
    return `Distância total de ${formatDistance(activity.distanceMeters)} registrada para seu treino de ${label.toLowerCase()}.`;
  }

  return `Seu treino de ${label.toLowerCase()} já está organizado em uma leitura curta e fácil de entender.`;
}

function humanizeSportType(sportType: string) {
  return humanizeActivityLabel(sportType) ?? "Atividade";
}
