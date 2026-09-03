import type { Activity, User, UserProfile } from "@prisma/client";

import { humanizeActivityLabel } from "@/lib/activity-text";
import {
  formatCadence,
  formatCalories,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatPower,
  formatSpeed,
  formatSwimPace,
} from "@/lib/format";
import {
  buildPostActivityReportTemplateFromActivity,
  renderPostActivityWhatsappText,
} from "@/lib/post-activity-report-template";
import type {
  AthleteDailyReadinessTemplateData,
  PostActivityHeartRateZone,
  PostActivityLegActivity,
  PostActivityMultiData,
  PostActivitySecondaryMetric,
  PostActivityStat,
  ReportRequest,
  ReportThemeSport,
  ReportThemeVariant,
} from "@/lib/reports/types";
import { getPublicAppUrl } from "@/server/env";
import { isGarminAccountLockedErrorCode } from "@/modules/garmin/domain/errors";
import type { GarminDailySnapshot } from "@/modules/garmin/application/daily";
import type { ProviderCapabilities } from "@/modules/shared/integrations/capabilities";
import { shouldRenderReportSection, type ReportSectionRequirement } from "@/modules/shared/reports/contracts";

/**
 * Requisitos de capability das seções fisiológicas do resumo diário
 * (Requisito 9.2). Cada métrica só é renderizada quando a capability exigida
 * está presente entre os providers conectados (Requisito 9.3, 9.5). Todas são
 * opcionais: a ausência apenas omite a seção, sem falhar o relatório.
 */
const DAILY_SLEEP_SECTION: ReportSectionRequirement = { capability: "sleep", optional: true };
const DAILY_BODY_BATTERY_SECTION: ReportSectionRequirement = { capability: "dailyWellness", optional: true };
const DAILY_HRV_SECTION: ReportSectionRequirement = { capability: "hrv", optional: true };
const DAILY_RESTING_HR_SECTION: ReportSectionRequirement = { capability: "recovery", optional: true };

/**
 * Capabilities padrão do resumo diário quando o chamador não informa as
 * capabilities dos providers conectados. Reflete o Garmin (único provider que
 * hoje alimenta o resumo diário fisiológico), preservando o comportamento
 * observável do Garmin: todas as seções continuam sendo renderizadas.
 *
 * _Requisitos: 9.5, 5.6_
 */
const DAILY_REPORT_DEFAULT_CAPABILITIES: ProviderCapabilities = {
  sleep: true,
  hrv: true,
  readiness: true,
  recovery: true,
  dailyWellness: true,
};

export type RenderableWhatsAppReport = {
  caption: string;
  fileName: string;
  request: ReportRequest;
};

export function buildPostActivityReportTemplate(input: {
  activity: Pick<
    Activity,
    | "sportType"
    | "name"
    | "startedAt"
    | "durationSeconds"
    | "distanceMeters"
    | "calories"
    | "averageHeartRate"
    | "averagePace"
    | "averageSpeed"
    | "elevationGain"
    | "averageCadence"
    | "averagePower"
  >;
}) {
  return buildPostActivityReportTemplateFromActivity(input.activity);
}

export function buildPostActivityReport(input: {
  user: Pick<User, "name"> & { profile: Pick<UserProfile, "phoneE164"> | null };
  activity: Pick<
    Activity,
    | "sportType"
    | "name"
    | "startedAt"
    | "durationSeconds"
    | "distanceMeters"
    | "calories"
    | "averageHeartRate"
    | "averagePace"
    | "averageSpeed"
    | "elevationGain"
    | "averageCadence"
    | "averagePower"
  >;
}) {
  const report = buildPostActivityReportTemplate({ activity: input.activity });

  return renderPostActivityWhatsappText({
    athleteName: input.user.name,
    occurredAt: input.activity.startedAt,
    report,
  });
}

export function buildPostActivityWhatsAppReport(input: {
  user: Pick<User, "name" | "image">;
  activity: Pick<
    Activity,
    | "sportType"
    | "name"
    | "startedAt"
    | "durationSeconds"
    | "distanceMeters"
    | "calories"
    | "averageHeartRate"
    | "averagePace"
    | "averageSpeed"
    | "elevationGain"
    | "averageCadence"
    | "averagePower"
  >;
  multisportLegs?: PostActivityLegActivity[];
  heartRateZones?: PostActivityHeartRateZone[];
}): RenderableWhatsAppReport {
  const firstName = getFirstName(input.user.name);
  const report = buildPostActivityReportTemplate({ activity: input.activity });
  const sport = getActivityThemeSport(input.activity.sportType);

  // Mapeia ReportThemeSport para o subset suportado pelo novo template
  // (natacao | corrida | ciclismo | surf)
  const variantSport: "natacao" | "corrida" | "ciclismo" | "surf" =
    sport === "swim" || sport === "open-water" ? "natacao"
    : sport === "bike" || sport === "mtb" ? "ciclismo"
    : sport === "surf" ? "surf"
    : "corrida";

  // Constrói heroStats a partir dos dois primeiros metrics do report
  const heroStats = report.metrics.slice(0, 4).map((m) => ({
    label: m.label.toUpperCase(),
    value: m.value.split(/\s+/)[0] ?? m.value,
    unit: m.value.split(/\s+/).slice(1).join(" ") || "",
  }));

  // Secondary metrics — a partir dos metrics restantes ou padrão
  const secondaryMetrics: PostActivitySecondaryMetric[] = [
    { icon: "heart", label: "FC MÉDIA", value: input.activity.averageHeartRate?.toString() ?? "—", unit: "bpm" },
    { icon: "heartpulse", label: "FC MÁXIMA", value: "—", unit: "bpm" },
    { icon: "flame", label: "CALORIAS", value: input.activity.calories?.toString() ?? "—", unit: "kcal" },
    { icon: "trending", label: "RITMO", value: input.activity.averagePace?.toString() ?? "—", unit: "" },
  ];

  const multisportData = buildMultisportReportData({
    sport,
    report,
    legs: input.multisportLegs ?? [],
    title: report.label,
    timeLabel: formatDateTime(input.activity.startedAt),
    athlete: { name: firstName, photoUrl: input.user.image ?? null },
    secondaryMetrics,
    heartRateZones: input.heartRateZones,
  });

  return {
    caption: `Seu relatório pós-atividade já está pronto, ${firstName}.`,
    fileName: `ryvano-atividade-${formatFileDate(input.activity.startedAt)}.svg`,
    request: {
      template: "post-activity-report",
      data: multisportData ?? {
        variant: "single",
        sport: variantSport,
        title: report.label,
        place: undefined,
        timeLabel: formatDateTime(input.activity.startedAt),
        athlete: {
          name: firstName,
          photoUrl: input.user.image ?? null,
        },
        heroStats,
        splitLabel: "Parciais",
        splitUnit: "",
        splits: [], // splits detalhados exigem dados de split individuais — sem essa fonte no momento
        secondaryMetrics,
        heartRateZones: input.heartRateZones,
      },
    },
  };
}

function buildMultisportReportData(input: {
  sport: ReportThemeSport;
  report: ReturnType<typeof buildPostActivityReportTemplate>;
  legs: PostActivityLegActivity[];
  title: string;
  timeLabel: string;
  athlete: { name: string; photoUrl: string | null };
  secondaryMetrics: PostActivitySecondaryMetric[];
  heartRateZones?: PostActivityHeartRateZone[];
}): PostActivityMultiData | null {
  if (!isMultisport(input.sport) || input.legs.length < 2) return null;

  const sports = new Set(input.legs.map((leg) => leg.sport));
  const combo = sports.has("natacao") && sports.has("ciclismo") && sports.has("corrida")
    ? "triatlo"
    : sports.has("natacao") && sports.has("corrida")
      ? "swimrun"
      : sports.has("ciclismo") && sports.has("corrida")
        ? "duatlo"
        : null;

  if (!combo) return null;

  const totalStats: PostActivityStat[] = input.report.metrics.slice(0, 4).map((metric) => {
    const [value, ...unit] = metric.value.split(/\s+/);
    return { label: metric.label.toUpperCase(), value: value ?? metric.value, unit: unit.join(" ") };
  });

  return {
    variant: "multi" as const,
    combo,
    title: input.title,
    timeLabel: input.timeLabel,
    athlete: input.athlete,
    totalStats,
    legs: input.legs,
    secondaryMetrics: input.secondaryMetrics,
    heartRateZones: input.heartRateZones,
  };
}

export function buildDailyGarminSummaryWhatsAppReport(input: {
  user: Pick<User, "name" | "image">;
  snapshot: GarminDailySnapshot;
  sport?: ReportThemeSport;
  /**
   * Capabilities dos providers conectados (união). Quando omitido, assume as
   * capabilities padrão do resumo diário (Garmin), preservando o comportamento
   * atual. Seções fisiológicas cuja capability não estiver presente são
   * omitidas sem falhar o relatório (Requisito 9.2, 9.3, 9.5).
   */
  capabilities?: ProviderCapabilities;
}): RenderableWhatsAppReport {
  const firstName = getFirstName(input.user.name);
  const sport: ReportThemeSport = input.sport ?? "triathlon";
  const capabilities = input.capabilities ?? DAILY_REPORT_DEFAULT_CAPABILITIES;

  // Tom da prontidão
  const readinessScore = input.snapshot.readiness.score ?? 0;
  const readinessTone: AthleteDailyReadinessTemplateData["readiness"]["tone"] =
    readinessScore >= 80 ? "good" :
    readinessScore >= 60 ? "moderate" :
    readinessScore >= 40 ? "warn" : "bad";

  // Data formatada em português
  const dateLabel = formatReportDate(input.snapshot.date);

  // Métricas no formato do novo template
  const metrics: AthleteDailyReadinessTemplateData["metrics"] = [];

  const sleepScore = input.snapshot.sleep.score;
  const sleepSec = input.snapshot.sleep.durationSeconds;
  if (sleepScore != null && shouldRenderReportSection(DAILY_SLEEP_SECTION, capabilities)) {
    const sleepH = sleepSec != null ? Math.floor(sleepSec / 3600) : null;
    const sleepM = sleepSec != null ? Math.floor((sleepSec % 3600) / 60) : null;
    metrics.push({
      type: "sleep",
      icon: "moon",
      label: "SONO REGENERATIVO",
      value: sleepScore,
      sub: sleepH != null ? `${sleepH}h ${sleepM}min` : undefined,
      tone: sleepScore >= 80 ? "good" : sleepScore >= 60 ? "moderate" : "warn",
    });
  }

  const bbLow = input.snapshot.summary.bodyBatteryLowest;
  const bbHigh = input.snapshot.summary.bodyBatteryHighest;
  if (bbLow != null && bbHigh != null && shouldRenderReportSection(DAILY_BODY_BATTERY_SECTION, capabilities)) {
    metrics.push({
      type: "battery",
      icon: "battery",
      label: "BODY BATTERY ENERGÉTICA",
      from: bbLow,
      to: bbHigh,
      sub: "RESERVA ENERGÉTICA",
    });
  }

  const hrvValue = input.snapshot.hrv.lastNightAvg;
  const hrvStatus = input.snapshot.hrv.status;
  if (hrvValue != null && shouldRenderReportSection(DAILY_HRV_SECTION, capabilities)) {
    metrics.push({
      type: "badge",
      icon: "hrv",
      label: "VFC NOTURNA",
      value: Math.round(hrvValue),
      unit: " ms",
      statusLabel: formatDailyHrvStatusLabel(hrvStatus),
      tone: "good",
    });
  }

  const rhr = input.snapshot.summary.restingHeartRate;
  if (rhr != null && shouldRenderReportSection(DAILY_RESTING_HR_SECTION, capabilities)) {
    metrics.push({
      type: "badge",
      icon: "hr",
      label: "FC REPOUSO",
      value: rhr,
      unit: " bpm",
      statusLabel: getRestingHeartRateStatusLabel(rhr),
      tone: getInvertedScoreTone(rhr, { low: 46, medium: 58 }) === "accent" ? "good" : "warn",
    });
  }

  return {
    caption: `Prontidão diária disponível para ${firstName}.`,
    fileName: `ryvano-readiness-${input.snapshot.date}.svg`,
    request: {
      template: "athlete-daily-readiness",
      data: {
        sport,
        reportType: "RELATÓRIO TRIATHLON | PERFORMANCE",
        date: dateLabel,
        athlete: {
          name: firstName.toUpperCase(),
          team: "RYVANO ESPORTS DATA",
        },
        readiness: {
          score: readinessScore,
          statusLabel: getDailyReadinessStatusLabel(readinessScore),
          tone: readinessTone,
          description: getDailyReadinessDescription(input.snapshot),
        },
        metrics,
        recommendations: buildDailyGarminRecommendations(input.snapshot),
      },
    },
  };
}

export function buildGarminDailySyncCheckWhatsAppReport(input: {
  user: Pick<User, "name" | "image">;
  date: string;
}): RenderableWhatsAppReport {
  const firstName = getFirstName(input.user.name);
  const integrationsUrl = new URL("/app/integracoes", getPublicAppUrl()).toString();

  return {
    caption: `Ainda estamos aguardando suas leituras Garmin de ${formatReportDate(input.date)}.`,
    fileName: `ryvano-garmin-aviso-${input.date}.png`,
    request: {
      template: "garmin-daily-sync-check",
      data: {
        athleteName: firstName,
        athleteImage: input.user.image ?? null,
        dateLabel: formatReportDate(input.date),
        title: "Leituras fisiológicas ainda não disponíveis",
        message: "Ainda não recebemos todas as métricas necessárias para gerar seu resumo diário de recuperação com consistência clínica.",
        checklist: [
          "Bluetooth do celular ativo",
          "App Garmin Connect aberto",
          "Sincronização concluída com sucesso",
        ],
        footer: `Assim que as leituras forem recebidas, seu resumo será atualizado automaticamente. Conferir integração: ${integrationsUrl}`,
        theme: {
          family: "warning",
          sport: "default",
          variant: getRotatingThemeVariant(`sync-check-${input.date}`),
        },
      },
    },
  };
}

export function buildGarminReconnectWhatsAppReport(input: {
  user: Pick<User, "name" | "image">;
  reconnectUrl: string;
  errorCode?: string | null;
}): RenderableWhatsAppReport {
  const firstName = getFirstName(input.user.name);
  const mfaRequired = input.errorCode === "GARMIN_MFA_REQUIRED";
  const accountLocked = isGarminAccountLockedErrorCode(input.errorCode);

  return {
    caption: accountLocked
      ? `Sua conta Garmin precisa de recuperação para continuar integrada à Ryvano. Acesse: ${input.reconnectUrl}`
      : `Sua conexão Garmin precisa ser revalidada para manter seus relatórios atualizados. Acesse: ${input.reconnectUrl}`,
    fileName: `ryvano-garmin-reconnect-${Date.now()}.png`,
    request: {
      template: "garmin-reconnect",
      data: {
        athleteName: firstName,
        athleteImage: input.user.image ?? null,
        title: accountLocked
          ? "Conta Garmin bloqueada"
          : mfaRequired
            ? "Conexão Garmin exige nova validação"
            : "Conexão Garmin precisa ser refeita",
        message: accountLocked
          ? "A Garmin sinalizou bloqueio da conta. Para restabelecer suas integrações e relatórios, faça a recuperação de acesso e depois refaça a conexão com a Ryvano."
          : mfaRequired
            ? "A Garmin informou autenticação em duas etapas ativa nesta conta. Para restabelecer a integração, ajuste o acesso na Garmin e refaça a conexão."
            : "Identificamos uma interrupção na integração com a Garmin. Revalidar a conexão evita perda de atualização de treinos, resumos e leituras fisiológicas.",
        checklist: accountLocked
          ? [
              "Recuperar acesso à conta Garmin",
              "Entrar novamente no Garmin Connect",
              "Refazer integração na Ryvano",
            ]
          : mfaRequired
            ? [
                "Ajustar autenticação na conta Garmin",
                "Abrir integração na Ryvano",
                "Concluir nova conexão",
              ]
            : [
                "Abrir integração Garmin na Ryvano",
                "Validar credenciais novamente",
                "Confirmar sincronização após reconexão",
              ],
        footer: `Acesso direto para revalidar integração: ${input.reconnectUrl}`,
        theme: {
          family: "reconnect",
          sport: "default",
          variant: getRotatingThemeVariant(`reconnect-${input.errorCode ?? "default"}-${firstName}`),
        },
      },
    },
  };
}

function buildDailySummaryChartPoints(snapshot: GarminDailySnapshot) {
  const points = [
    {
      label: "Sono",
      value: snapshot.sleep.score ?? 0,
      formattedValue: formatScore(snapshot.sleep.score),
    },
    {
      label: "Prontidão",
      value: snapshot.readiness.score ?? 0,
      formattedValue: formatScore(snapshot.readiness.score),
    },
    {
      label: "Battery",
      value: snapshot.summary.bodyBatteryHighest ?? 0,
      formattedValue: formatBodyBatteryValue(snapshot.summary.bodyBatteryHighest),
    },
    {
      label: "VFC",
      value: snapshot.hrv.lastNightAvg ?? 0,
      formattedValue: formatMilliseconds(snapshot.hrv.lastNightAvg),
    },
    {
      label: "FC",
      value: snapshot.summary.restingHeartRate ?? 0,
      formattedValue: formatHeartRate(snapshot.summary.restingHeartRate),
    },
  ].filter((point) => point.value > 0);

  return points.length
    ? points
    : [{
        label: "Sem dados",
        value: 1,
        formattedValue: "—",
        tone: "warning" as const,
      }];
}

function buildPostActivityChartPoints(
  activity: {
    durationSeconds?: number | null;
    distanceMeters?: number | null;
    averageHeartRate?: number | null;
    calories?: number | null;
    averagePace?: number | null;
    averageSpeed?: number | null;
    elevationGain?: number | null;
    averageCadence?: number | null;
    averagePower?: number | null;
  },
  sport: ReportThemeSport,
) {
  const addPoint = (label: string, value: number | null | undefined, formattedValue: string, tone?: "accent" | "neutral" | "warning") => ({
    label,
    value: value ?? 0,
    formattedValue,
    tone,
  });
  const commonPoints = [
    addPoint("Tempo", activity.durationSeconds ? Math.max(1, Math.round(activity.durationSeconds / 60)) : 0, formatDuration(activity.durationSeconds)),
    addPoint("Distância", activity.distanceMeters ? Math.max(1, Number((activity.distanceMeters / 1000).toFixed(1))) : 0, formatDistance(activity.distanceMeters)),
  ];

  const sportPoints = isWaterSport(sport)
    ? [
        addPoint(
          sport === "surf" ? "Velocidade" : "Ritmo",
          sport === "surf"
            ? activity.averageSpeed
            : activity.averagePace
              ? Math.max(1, Math.round(600 / activity.averagePace))
              : 0,
          sport === "surf" ? formatSpeed(activity.averageSpeed) : formatSwimPace(activity.averagePace),
        ),
        addPoint("FC", activity.averageHeartRate, formatHeartRate(activity.averageHeartRate)),
      ]
    : isCyclingSport(sport)
      ? [
          addPoint("Velocidade", activity.averageSpeed, formatSpeed(activity.averageSpeed)),
          addPoint(sport === "mtb" ? "Elevação" : "Potência", sport === "mtb" ? activity.elevationGain : activity.averagePower, sport === "mtb" ? formatElevation(activity.elevationGain) : formatPower(activity.averagePower)),
        ]
      : isRunSport(sport)
        ? [
            addPoint(
              sport === "walking" || sport === "hiking" ? "Velocidade" : "Ritmo",
              sport === "walking" || sport === "hiking"
                ? activity.averageSpeed
                : activity.averagePace
                  ? Math.max(1, Math.round(720 / activity.averagePace))
                  : 0,
              sport === "walking" || sport === "hiking" ? formatSpeed(activity.averageSpeed) : formatPace(activity.averagePace),
            ),
            addPoint(sport === "trail-run" || sport === "hiking" ? "Elevação" : "Cadência", sport === "trail-run" || sport === "hiking" ? activity.elevationGain : activity.averageCadence, sport === "trail-run" || sport === "hiking" ? formatElevation(activity.elevationGain) : formatCadence(activity.averageCadence)),
          ]
        : isMultisport(sport)
          ? [
              addPoint("FC", activity.averageHeartRate, formatHeartRate(activity.averageHeartRate)),
              addPoint("Energia", activity.calories, formatCalories(activity.calories)),
            ]
          : isGymSport(sport)
            ? [
                addPoint("FC", activity.averageHeartRate, formatHeartRate(activity.averageHeartRate)),
                addPoint("Energia", activity.calories, formatCalories(activity.calories)),
              ]
            : isCourtSport(sport)
              ? [
                  addPoint("FC", activity.averageHeartRate, formatHeartRate(activity.averageHeartRate)),
                  addPoint("Energia", activity.calories, formatCalories(activity.calories)),
                ]
              : [
                  addPoint("FC", activity.averageHeartRate, formatHeartRate(activity.averageHeartRate)),
                  addPoint("Elevação", activity.elevationGain, formatElevation(activity.elevationGain)),
                ];

  const points = [...commonPoints, ...sportPoints].filter((point) => point.value > 0);

  return points.length
    ? points
    : [{
        label: "Treino",
        value: 1,
        formattedValue: "—",
        tone: "neutral" as const,
      }];
}

function getPostActivityChartTitle(sport: ReportThemeSport) {
  if (sport === "open-water") {
    return "Leitura premium da sessão em águas abertas";
  }

  if (sport === "swim") {
    return "Eficiência da sessão de natação";
  }

  if (sport === "surf") {
    return "Síntese visual da sessão de surf";
  }

  if (sport === "rowing" || sport === "kayak" || sport === "stand-up-paddle") {
    return "Deslocamento e resposta da sessão aquática";
  }

  if (sport === "mtb") {
    return "Carga, terreno e elevação do MTB";
  }

  if (sport === "bike") {
    return "Potência e deslocamento do pedal";
  }

  if (sport === "trail-run") {
    return "Ritmo e altimetria da corrida em trilha";
  }

  if (sport === "run") {
    return "Leitura de ritmo e mecânica da corrida";
  }

  if (sport === "walking" || sport === "hiking") {
    return "Volume e deslocamento da sessão outdoor";
  }

  if (isMultisport(sport)) {
    return "Síntese visual da sessão multisport";
  }

  if (isGymSport(sport)) {
    return "Carga interna da sessão de força";
  }

  if (isCourtSport(sport)) {
    return "Resumo atlético da sessão técnica";
  }

  return "Leitura visual das métricas centrais";
}

function getPostActivityChartNote(sport: ReportThemeSport) {
  if (sport === "open-water") {
    return "Foco em volume, tempo de prova, ritmo sustentado e resposta cardiovascular em águas abertas.";
  }

  if (sport === "swim") {
    return "Destaque para volume, tempo dentro d'água, ritmo médio e resposta cardiovascular da sessão.";
  }

  if (sport === "surf") {
    return "Leitura premium para entender duração, deslocamento e intensidade geral da sessão no mar.";
  }

  if (sport === "rowing" || sport === "kayak" || sport === "stand-up-paddle") {
    return "Visão curta para volume, duração e resposta fisiológica das modalidades aquáticas de deslocamento.";
  }

  if (sport === "mtb") {
    return "Ênfase em volume, tempo, velocidade média e exigência vertical da trilha.";
  }

  if (sport === "bike") {
    return "Leitura integrada de volume, tempo, velocidade média e potência do pedal.";
  }

  if (sport === "trail-run") {
    return "Resumo premium com foco em volume, ritmo médio e altimetria da corrida em terreno irregular.";
  }

  if (sport === "run") {
    return "Visão curta para interpretar volume, duração, ritmo médio e cadência da corrida.";
  }

  if (sport === "walking" || sport === "hiking") {
    return "Leitura elegante do deslocamento, duração e intensidade leve a moderada da sessão.";
  }

  if (isMultisport(sport)) {
    return "Resumo premium para sessões compostas com ênfase em carga total e resposta fisiológica.";
  }

  if (isGymSport(sport)) {
    return "Síntese objetiva da carga interna com foco em tempo total, frequência cardíaca e gasto energético.";
  }

  if (isCourtSport(sport)) {
    return "Panorama premium da sessão esportiva com leitura rápida de duração, demanda cardiovascular e energia.";
  }

  return "Comparativo visual entre duração, distância e indicadores centrais da atividade.";
}

function getActivityThemeSport(sportType: string): ReportThemeSport {
  const normalized = normalizeSportType(sportType);

  if (!normalized) {
    return "default";
  }

  if (normalized.includes("open_water") || normalized.includes("openwater")) {
    return "open-water";
  }

  if (normalized.includes("stand_up_paddle") || normalized.includes("standup_paddle") || normalized.includes("sup")) {
    return "stand-up-paddle";
  }

  if (normalized.includes("mountain_bike") || normalized.includes("mountainbike") || normalized.includes("mtb")) {
    return "mtb";
  }

  if (normalized.includes("trail_run") || normalized.includes("trail_running") || normalized.includes("trail")) {
    return "trail-run";
  }

  if (normalized.includes("duathlon")) {
    return "duathlon";
  }

  if (normalized.includes("aquathlon")) {
    return "aquathlon";
  }

  if (normalized.includes("triathlon") || normalized.includes("multisport")) {
    return "triathlon";
  }

  if (normalized.includes("walking") || normalized.includes("walk") || normalized.includes("caminh")) {
    return "walking";
  }

  if (normalized.includes("hiking") || normalized.includes("hik") || normalized.includes("trilha")) {
    return "hiking";
  }

  if (normalized.includes("crossfit") || normalized.includes("hiit")) {
    return "crossfit";
  }

  if (normalized.includes("strength") || normalized.includes("gym") || normalized.includes("muscul")) {
    return "gym";
  }

  if (normalized.includes("futsal")) {
    return "futsal";
  }

  if (normalized.includes("football") || normalized.includes("soccer") || normalized.includes("futebol")) {
    return "football";
  }

  if (normalized.includes("basket")) {
    return "basketball";
  }

  if (normalized.includes("volley") || normalized.includes("volei") || normalized.includes("vôlei")) {
    return "volleyball";
  }

  if (normalized.includes("padel")) {
    return "padel";
  }

  if (normalized.includes("tennis") || normalized.includes("tênis")) {
    return "tennis";
  }

  if (normalized.includes("surf")) {
    return "surf";
  }

  if (normalized.includes("rowing") || normalized.includes("remo") || normalized.includes("row")) {
    return "rowing";
  }

  if (normalized.includes("kayak") || normalized.includes("canoe") || normalized.includes("caiaque")) {
    return "kayak";
  }

  if (normalized.includes("swim") || normalized.includes("swimming") || normalized.includes("nat")) {
    return "swim";
  }

  if (normalized.includes("bike") || normalized.includes("cycl") || normalized.includes("ride") || normalized.includes("bik")) {
    return "bike";
  }

  if (normalized.includes("run") || normalized.includes("corr")) {
    return "run";
  }

  return "default";
}

function getActivityThemeLabel(
  sportType: string,
  fallbackLabel: string,
  sport: ReportThemeSport,
) {
  const humanized = humanizeActivityLabel(sportType);

  if (humanized) {
    return humanized;
  }

  if (sport === "open-water") {
    return "Natação em águas abertas";
  }

  if (sport === "mtb") {
    return "Mountain bike";
  }

  if (sport === "trail-run") {
    return "Corrida em trilha";
  }

  if (sport === "stand-up-paddle") {
    return "Stand up paddle";
  }

  if (sport === "crossfit") {
    return "CrossFit";
  }

  if (sport === "gym") {
    return "Musculação";
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

  return fallbackLabel;
}

function normalizeSportType(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
}

function isWaterSport(sport: ReportThemeSport) {
  return sport === "swim"
    || sport === "open-water"
    || sport === "surf"
    || sport === "rowing"
    || sport === "kayak"
    || sport === "stand-up-paddle";
}

function isCyclingSport(sport: ReportThemeSport) {
  return sport === "bike" || sport === "mtb";
}

function isRunSport(sport: ReportThemeSport) {
  return sport === "run" || sport === "trail-run" || sport === "walking" || sport === "hiking";
}

function isMultisport(sport: ReportThemeSport) {
  return sport === "triathlon" || sport === "duathlon" || sport === "aquathlon";
}

function isGymSport(sport: ReportThemeSport) {
  return sport === "gym" || sport === "crossfit";
}

function isCourtSport(sport: ReportThemeSport) {
  return sport === "football"
    || sport === "futsal"
    || sport === "basketball"
    || sport === "volleyball"
    || sport === "tennis"
    || sport === "padel";
}

function getRotatingThemeVariant(seed: string) {
  const variants: readonly ReportThemeVariant[] = ["pearl", "mist", "sunrise"];
  return variants[Math.abs(hashSeed(seed)) % variants.length] ?? "pearl";
}

function hashSeed(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return hash;
}

function formatThemeSeedDate(value: Date | string | null | undefined) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function getDailyReadinessStatusLabel(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return "LEITURA INCOMPLETA";
  }

  if (score >= 85) {
    return "RECUPERAÇÃO ÓTIMA";
  }

  if (score >= 70) {
    return "BOA RECUPERAÇÃO";
  }

  if (score >= 50) {
    return "RECUPERAÇÃO MODERADA";
  }

  return "RECUPERAÇÃO BAIXA";
}

function getDailyReadinessDescription(snapshot: GarminDailySnapshot) {
  const feedback = cleanShortText(snapshot.readiness.feedback);

  if (feedback && feedback.length <= 120 && !looksLikeStatusCode(feedback)) {
    return feedback;
  }

  const score = snapshot.readiness.score;

  if (score === null || score === undefined) {
    return "Leituras do dia organizadas para orientar sua decisão de treino com mais clareza.";
  }

  if (score >= 85) {
    return "Corpo bem posicionado para uma sessão forte, desde que percepção subjetiva e técnica confirmem o plano.";
  }

  if (score >= 70) {
    return "Estado geral positivo para treino de qualidade com carga bem distribuída ao longo do dia.";
  }

  if (score >= 50) {
    return "Dia mais indicado para intensidade moderada, com atenção especial à resposta do corpo.";
  }

  return "Sinais pedem mais cautela hoje. Priorize recuperação ativa, mobilidade ou sessão mais leve.";
}

function buildDailyGarminRecommendations(snapshot: GarminDailySnapshot) {
  const recommendations: string[] = [];
  const readinessScore = snapshot.readiness.score;
  const sleepScore = snapshot.sleep.score;
  const bodyBatteryHigh = snapshot.summary.bodyBatteryHighest;
  const hrvStatus = normalizeText(snapshot.hrv.status);

  if (readinessScore !== null && readinessScore !== undefined) {
    if (readinessScore >= 85) {
      recommendations.push("Janela favorável para treino forte ou sessão-chave, com progressão bem controlada.");
    } else if (readinessScore >= 70) {
      recommendations.push("Bom momento para treino de qualidade com intensidade controlada e execução técnica limpa.");
    } else if (readinessScore >= 50) {
      recommendations.push("Prefira carga moderada hoje e ajuste volume conforme percepção corporal durante a sessão.");
    } else {
      recommendations.push("Priorize recuperação ativa, mobilidade e menor exigência fisiológica ao longo do dia.");
    }
  }

  if (sleepScore !== null && sleepScore !== undefined) {
    if (sleepScore < 70) {
      recommendations.push("Sono abaixo do ideal. Antecipe descanso noturno e reduza estímulos intensos se possível.");
    } else if (sleepScore >= 85) {
      recommendations.push("Recuperação noturna forte, bom sinal para sustentar consistência no treino planejado.");
    }
  }

  if (hrvStatus.includes("baixa") || hrvStatus.includes("low")) {
    recommendations.push("VFC abaixo do padrão. Observe fadiga acumulada antes de subir intensidade ou volume.");
  } else if (hrvStatus.includes("balance") || hrvStatus.includes("equilibr")) {
    recommendations.push("VFC equilibrada hoje, sinal favorável de adaptação ao treinamento recente.");
  }

  if (bodyBatteryHigh !== null && bodyBatteryHigh !== undefined) {
    if (bodyBatteryHigh < 50) {
      recommendations.push("Reserva energética limitada. Prefira sessão mais curta ou com menor exigência metabólica.");
    } else if (bodyBatteryHigh >= 80) {
      recommendations.push("Boa reserva energética para distribuir melhor carga, técnica e volume planejado.");
    }
  }

  if (snapshot.warnings[0]) {
    recommendations.push(cleanShortText(snapshot.warnings[0]));
  }

  const uniqueRecommendations = recommendations.filter((value, index, values) => value && values.indexOf(value) === index);

  return (uniqueRecommendations.length
    ? uniqueRecommendations
    : ["Use este card como leitura rápida antes da decisão final de treino."]
  ).slice(0, 3);
}

function getRestingHeartRateStatusLabel(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "SEM LEITURA";
  }

  if (value <= 46) {
    return "ÓTIMA";
  }

  if (value <= 58) {
    return "NORMAL";
  }

  return "ATENÇÃO";
}

function formatDailyHrvStatusLabel(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return undefined;
  }

  if (normalized.includes("balanced") || normalized.includes("equilibrad")) {
    return "BALANCEADA";
  }

  if (normalized.includes("low") || normalized.includes("baixa")) {
    return "BAIXA";
  }

  if (normalized.includes("high") || normalized.includes("alta")) {
    return "ALTA";
  }

  return cleanShortText(value).toUpperCase();
}

function getBodyBatteryStatusLabel(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "SEM LEITURA";
  }

  if (value >= 80) {
    return "ALTA";
  }

  if (value >= 50) {
    return "MODERADA";
  }

  return "BAIXA";
}

function cleanShortText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function looksLikeStatusCode(value: string) {
  return /^[A-Z0-9_]+$/.test(value) && value.includes("_");
}

function normalizeText(value: string | null | undefined) {
  return cleanShortText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getScoreTone(
  value: number | null | undefined,
  thresholds: { low: number; medium: number },
) {
  if (value === null || value === undefined) {
    return "neutral" as const;
  }

  if (value < thresholds.low) {
    return "warning" as const;
  }

  if (value < thresholds.medium) {
    return "neutral" as const;
  }

  return "accent" as const;
}

function getInvertedScoreTone(
  value: number | null | undefined,
  thresholds: { low: number; medium: number },
) {
  if (value === null || value === undefined) {
    return "neutral" as const;
  }

  if (value <= thresholds.low) {
    return "accent" as const;
  }

  if (value <= thresholds.medium) {
    return "neutral" as const;
  }

  return "warning" as const;
}

function getFirstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] ?? "atleta";
}

function formatFileDate(value: Date | string | null | undefined) {
  if (!value) {
    return String(Date.now());
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(Date.now());
  }

  return date.toISOString().slice(0, 10);
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}/100`;
}

function formatMilliseconds(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)} ms`;
}

function formatBodyBatteryRange(low: number | null | undefined, high: number | null | undefined) {
  if (low !== null && low !== undefined && high !== null && high !== undefined) {
    return `${Math.round(low)}–${Math.round(high)}`;
  }

  if (high !== null && high !== undefined) {
    return `máx ${Math.round(high)}`;
  }

  if (low !== null && low !== undefined) {
    return `mín ${Math.round(low)}`;
  }

  return "—";
}

function formatBodyBatteryValue(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}`;
}

function formatReportDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

