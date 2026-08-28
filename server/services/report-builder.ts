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
import type { ReportRequest, ReportThemeSport, ReportThemeVariant } from "@/lib/reports/types";
import { getPublicAppUrl } from "@/server/env";
import { isGarminAccountLockedErrorCode } from "@/server/services/garmin-connection-errors";
import type { GarminDailySnapshot } from "@/server/services/garmin-daily-report";

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
  user: Pick<User, "name">;
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
}): RenderableWhatsAppReport {
  const firstName = getFirstName(input.user.name);
  const report = buildPostActivityReportTemplate({ activity: input.activity });
  const dashboardUrl = new URL("/app/dashboard", getPublicAppUrl()).toString();
  const sport = getActivityThemeSport(input.activity.sportType);
  const activityLabel = getActivityThemeLabel(input.activity.sportType, report.label, sport);

  return {
    caption: `Seu relatório pós-atividade já está pronto, ${firstName}.`,
    fileName: `ryvano-atividade-${formatFileDate(input.activity.startedAt)}.png`,
    request: {
      template: "post-activity-report",
      data: {
        athleteName: firstName,
        activityLabel: activityLabel,
        occurredAtLabel: formatDateTime(input.activity.startedAt),
        summary: report.summary,
        insight: report.insight,
        metrics: report.metrics.map((metric) => ({
          label: metric.label,
          value: metric.value,
        })),
        chips: report.chips.slice(0, 3),
        chart: {
          title: getPostActivityChartTitle(sport),
          type: "bar",
          data: buildPostActivityChartPoints(input.activity, sport),
          note: getPostActivityChartNote(sport),
        },
        footer: "Sua atividade foi organizada em um card visual premium para leitura rápida, clara e elegante no WhatsApp.",
        cta: `Painel completo: ${dashboardUrl}`,
        sport,
        theme: {
          family: "activity",
          sport,
          variant: getRotatingThemeVariant(`${sport}-${formatThemeSeedDate(input.activity.startedAt)}`),
        },
      },
    },
  };
}

export function buildDailyGarminSummaryWhatsAppReport(input: {
  user: Pick<User, "name">;
  snapshot: GarminDailySnapshot;
}): RenderableWhatsAppReport {
  const firstName = getFirstName(input.user.name);
  const dashboardUrl = new URL("/app/dashboard", getPublicAppUrl()).toString();

  return {
    caption: `Resumo fisiológico do dia disponível para ${firstName}.`,
    fileName: `ryvano-garmin-${input.snapshot.date}.png`,
    request: {
      template: "daily-garmin-summary",
      data: {
        athleteName: firstName,
        dateLabel: formatReportDate(input.snapshot.date),
        overview: "Leituras combinadas de recuperação, prontidão e modulação autonômica para orientar sua tomada de decisão no dia com visual leve e premium.",
        metrics: [
          {
            label: "Prontidão",
            value: formatScore(input.snapshot.readiness.score),
            helper: input.snapshot.readiness.level ?? input.snapshot.readiness.feedback ?? undefined,
            tone: getScoreTone(input.snapshot.readiness.score, { low: 45, medium: 70 }),
          },
          {
            label: "FC repouso",
            value: formatHeartRate(input.snapshot.summary.restingHeartRate),
            tone: getInvertedScoreTone(input.snapshot.summary.restingHeartRate, { low: 46, medium: 58 }),
          },
          {
            label: "VFC noturna",
            value: formatMilliseconds(input.snapshot.hrv.lastNightAvg),
            helper: input.snapshot.hrv.status ?? undefined,
            tone: getScoreTone(input.snapshot.hrv.lastNightAvg, { low: 38, medium: 58 }),
          },
          {
            label: "Sleep Score",
            value: formatScore(input.snapshot.sleep.score),
            helper: input.snapshot.sleep.durationSeconds !== null ? formatDuration(input.snapshot.sleep.durationSeconds) : undefined,
            tone: getScoreTone(input.snapshot.sleep.score, { low: 60, medium: 78 }),
          },
          {
            label: "Body Battery",
            value: formatBodyBatteryRange(input.snapshot.summary.bodyBatteryLowest, input.snapshot.summary.bodyBatteryHighest),
            tone: getScoreTone(input.snapshot.summary.bodyBatteryHighest, { low: 35, medium: 65 }),
          },
        ],
        chart: {
          title: "Leituras-chave do dia",
          type: "line",
          data: buildDailySummaryChartPoints(input.snapshot),
          note: "Escala visual para leitura integrada de prontidão, recuperação e variáveis fisiológicas do dia.",
        },
        footer: "Esses indicadores ajudam a interpretar seu estado de recuperação e sua resposta ao treinamento com leitura elegante e direta.",
        cta: `Painel completo: ${dashboardUrl}`,
        theme: {
          family: "daily",
          sport: "default",
          variant: getRotatingThemeVariant(`daily-${input.snapshot.date}`),
        },
      },
    },
  };
}

export function buildGarminDailySyncCheckWhatsAppReport(input: {
  user: Pick<User, "name">;
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
  user: Pick<User, "name">;
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

