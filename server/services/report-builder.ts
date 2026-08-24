import type { Activity, User, UserProfile } from "@prisma/client";

import {
  buildPostActivityReportTemplateFromActivity,
  renderPostActivityWhatsappText,
} from "@/lib/post-activity-report-template";
import { formatCalories, formatDistance, formatDuration, formatHeartRate } from "@/lib/format";
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
    `📊 Resumo diário Garmin · ${formatReportDate(input.snapshot.date)}`,
    `Olá, ${firstName}.`,
    buildSleepLine(input.snapshot),
    buildReadinessLine(input.snapshot),
    buildBodyBatteryLine(input.snapshot),
    buildHrvLine(input.snapshot),
    buildMovementLine(input.snapshot),
    buildHeartRateLine(input.snapshot),
    input.snapshot.warnings[0] ? `⚠️ ${input.snapshot.warnings[0]}` : null,
    `Abra painel: ${dashboardUrl}`,
  ].filter(Boolean);

  return lines.join("\n");
}

function buildSleepLine(snapshot: GarminDailySnapshot) {
  const details = [
    `😴 Sono: ${formatDuration(snapshot.sleep.durationSeconds)}`,
    snapshot.sleep.score !== null ? `score ${formatScore(snapshot.sleep.score)}` : null,
  ].filter(Boolean);

  return details.join(" • ");
}

function buildReadinessLine(snapshot: GarminDailySnapshot) {
  const details = [
    `⚡ Prontidão: ${formatScore(snapshot.readiness.score)}`,
    snapshot.readiness.level ?? snapshot.readiness.feedback,
    snapshot.readiness.recoveryTimeMinutes !== null
      ? `recuperação ${formatDuration(snapshot.readiness.recoveryTimeMinutes * 60)}`
      : null,
  ].filter(Boolean);

  return details.join(" • ");
}

function buildBodyBatteryLine(snapshot: GarminDailySnapshot) {
  return `🔋 Body Battery: ${formatBodyBatteryRange(snapshot.summary.bodyBatteryLowest, snapshot.summary.bodyBatteryHighest)}`;
}

function buildHrvLine(snapshot: GarminDailySnapshot) {
  const details = [
    `🫀 HRV: ${formatMilliseconds(snapshot.hrv.lastNightAvg)}`,
    snapshot.hrv.status,
  ].filter(Boolean);

  return details.join(" • ");
}

function buildMovementLine(snapshot: GarminDailySnapshot) {
  const details = [
    `👟 Passos: ${formatCount(snapshot.summary.steps)}`,
    formatDistance(snapshot.summary.distanceMeters),
    formatCalories(snapshot.summary.activeKilocalories ?? snapshot.summary.totalKilocalories),
  ].filter(Boolean);

  return details.join(" • ");
}

function buildHeartRateLine(snapshot: GarminDailySnapshot) {
  const details = [
    `❤️ FC repouso: ${formatHeartRate(snapshot.summary.restingHeartRate)}`,
    snapshot.sleep.avgSleepHrv !== null ? `HRV sono ${formatMilliseconds(snapshot.sleep.avgSleepHrv)}` : null,
  ].filter(Boolean);

  return details.join(" • ");
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}/100`;
}

function formatBodyBatteryRange(low: number | null | undefined, high: number | null | undefined) {
  if (low === null || low === undefined || high === null || high === undefined) {
    return "—";
  }

  return `${Math.round(low)}–${Math.round(high)}`;
}

function formatMilliseconds(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)} ms`;
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
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
