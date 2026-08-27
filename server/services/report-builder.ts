import type { Activity, User, UserProfile } from "@prisma/client";

import {
  buildPostActivityReportTemplateFromActivity,
  renderPostActivityWhatsappText,
} from "@/lib/post-activity-report-template";
import { formatDuration, formatHeartRate } from "@/lib/format";
import { getPublicAppUrl } from "@/server/env";
import type { GarminDailySnapshot } from "@/server/services/garmin-daily-report";

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

export function buildDailyGarminSummaryReport(input: {
  user: Pick<User, "name">;
  snapshot: GarminDailySnapshot;
}) {
  const firstName = input.user.name?.trim().split(/\s+/)[0] ?? "atleta";
  const dashboardUrl = new URL("/app/dashboard", getPublicAppUrl()).toString();
  const lines = [
    `📊 Seu briefing Garmin do dia · ${formatReportDate(input.snapshot.date)}`,
    `Olá, ${firstName}. Seu panorama de recuperação e desempenho já está disponível.`,
    buildReadinessLine(input.snapshot),
    buildHeartRateLine(input.snapshot),
    buildHrvLine(input.snapshot),
    buildSleepScoreLine(input.snapshot),
    buildBodyBatteryLine(input.snapshot),
    "Seu dia começa com mais clareza quando seus dados trabalham a seu favor.",
    `Acesse seu painel completo: ${dashboardUrl}`,
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildGarminDailySyncCheckReport(input: {
  user: Pick<User, "name">;
  date: string;
}) {
  const firstName = input.user.name?.trim().split(/\s+/)[0] ?? "atleta";
  const integrationsUrl = new URL("/app/integracoes", getPublicAppUrl()).toString();

  return [
    `⚠️ Leituras diárias ainda não disponíveis · ${formatReportDate(input.date)}`,
    `Olá, ${firstName}. Ainda não recebemos todas as métricas necessárias para gerar seu resumo diário de recuperação.`,
    "Recomendamos verificar:",
    "• Bluetooth do celular ativo",
    "• app Garmin Connect aberto",
    "• sincronização concluída com sucesso",
    "Quando as leituras forem recebidas, o resumo será atualizado automaticamente.",
    `Conferir integração: ${integrationsUrl}`,
  ].join("\n");
}

function buildReadinessLine(snapshot: GarminDailySnapshot) {
  const details = [
    `⚡ Disposição: ${formatScore(snapshot.readiness.score)}`,
    snapshot.readiness.level ?? snapshot.readiness.feedback,
    snapshot.readiness.recoveryTimeMinutes !== null
      ? `recuperação estimada ${formatDuration(snapshot.readiness.recoveryTimeMinutes * 60)}`
      : null,
  ].filter(Boolean);

  return details.join(" • ");
}

function buildHeartRateLine(snapshot: GarminDailySnapshot) {
  return `❤️ Frequência cardíaca em repouso: ${formatHeartRate(snapshot.summary.restingHeartRate)}`;
}

function buildHrvLine(snapshot: GarminDailySnapshot) {
  const details = [
    `🫀 VFC: ${formatMilliseconds(snapshot.hrv.lastNightAvg)}`,
    snapshot.hrv.status,
  ].filter(Boolean);

  return details.join(" • ");
}

function buildSleepScoreLine(snapshot: GarminDailySnapshot) {
  const details = [
    `😴 Sleep Score: ${formatScore(snapshot.sleep.score)}`,
    snapshot.sleep.durationSeconds !== null ? `sono ${formatDuration(snapshot.sleep.durationSeconds)}` : null,
  ].filter(Boolean);

  return details.join(" • ");
}

function buildBodyBatteryLine(snapshot: GarminDailySnapshot) {
  return `🔋 Body Battery: ${formatBodyBatteryRange(snapshot.summary.bodyBatteryLowest, snapshot.summary.bodyBatteryHighest)}`;
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}/100`;
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

function formatMilliseconds(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)} ms`;
}

function formatReportDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
