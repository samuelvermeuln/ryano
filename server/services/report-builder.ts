import type { Activity, User, UserProfile } from "@prisma/client";

import { formatCalories, formatDateTime, formatDistance, formatDuration, formatHeartRate } from "@/lib/format";
import {
  buildPostActivityReportTemplateFromActivity,
  renderPostActivityWhatsappText,
} from "@/lib/post-activity-report-template";
import type { ReportRequest } from "@/lib/reports/types";
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

  return {
    caption: `Seu relatório pós-atividade já está pronto, ${firstName}.`,
    fileName: `ryvano-atividade-${formatFileDate(input.activity.startedAt)}.png`,
    request: {
      template: "post-activity-report",
      data: {
        athleteName: firstName,
        activityLabel: report.label,
        occurredAtLabel: formatDateTime(input.activity.startedAt),
        summary: report.summary,
        insight: report.insight,
        metrics: report.metrics.map((metric) => ({
          label: metric.label,
          value: metric.value,
        })),
        chips: report.chips.slice(0, 3),
        chart: {
          title: "Leitura visual das métricas centrais",
          type: "bar",
          data: buildPostActivityChartPoints(input.activity),
          note: "Comparativo visual entre duração, distância, frequência cardíaca média e gasto energético.",
        },
        footer: "Sua atividade foi organizada em um card visual para leitura rápida e acompanhamento personalizado.",
        cta: `Painel completo: ${dashboardUrl}`,
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
        overview: "Leituras combinadas de recuperação, prontidão e modulação autonômica para orientar sua tomada de decisão no dia.",
        metrics: [
          {
            label: "Prontidão",
            value: formatScore(input.snapshot.readiness.score),
            helper: input.snapshot.readiness.level ?? input.snapshot.readiness.feedback ?? undefined,
          },
          {
            label: "FC repouso",
            value: formatHeartRate(input.snapshot.summary.restingHeartRate),
          },
          {
            label: "VFC noturna",
            value: formatMilliseconds(input.snapshot.hrv.lastNightAvg),
            helper: input.snapshot.hrv.status ?? undefined,
          },
          {
            label: "Sleep Score",
            value: formatScore(input.snapshot.sleep.score),
            helper: input.snapshot.sleep.durationSeconds !== null ? formatDuration(input.snapshot.sleep.durationSeconds) : undefined,
          },
          {
            label: "Body Battery",
            value: formatBodyBatteryRange(input.snapshot.summary.bodyBatteryLowest, input.snapshot.summary.bodyBatteryHighest),
          },
        ],
        chart: {
          title: "Leituras-chave do dia",
          type: "line",
          data: buildDailySummaryChartPoints(input.snapshot),
          note: "Escala visual para leitura integrada de prontidão, recuperação e variáveis fisiológicas do dia.",
        },
        footer: "Esses indicadores ajudam a interpretar seu estado de recuperação e sua resposta ao treinamento.",
        cta: `Painel completo: ${dashboardUrl}`,
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

function buildPostActivityChartPoints(activity: {
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  averageHeartRate?: number | null;
  calories?: number | null;
}) {
  const points = [
    {
      label: "Tempo",
      value: activity.durationSeconds ? Math.max(1, Math.round(activity.durationSeconds / 60)) : 0,
      formattedValue: formatDuration(activity.durationSeconds),
    },
    {
      label: "Distância",
      value: activity.distanceMeters ? Math.max(1, Number((activity.distanceMeters / 1000).toFixed(1))) : 0,
      formattedValue: formatDistance(activity.distanceMeters),
    },
    {
      label: "FC",
      value: activity.averageHeartRate ?? 0,
      formattedValue: formatHeartRate(activity.averageHeartRate),
    },
    {
      label: "Energia",
      value: activity.calories ?? 0,
      formattedValue: formatCalories(activity.calories),
    },
  ].filter((point) => point.value > 0);

  return points.length
    ? points
    : [{
        label: "Treino",
        value: 1,
        formattedValue: "—",
        tone: "neutral" as const,
      }];
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

