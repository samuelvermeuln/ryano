/**
 * Snapshot diário do Garmin (application/daily).
 *
 * Movido de `server/services/garmin-daily-report.ts` na tarefa 2.3. Mantido
 * verbatim (apenas ajuste de imports para o módulo) para preservar o
 * comportamento observável do Garmin (movimento estrutural — Requisito 5.6). Um
 * shim permanece no caminho antigo até a religação da tarefa 2.5.
 *
 * _Requisitos: 5.1, 5.2_
 */

import { ConnectionStatus, SecretType, WearableProvider } from "@prisma/client";

import { decryptSecret } from "@/server/crypto/secret-vault";
import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";
import { garminProvider } from "@/modules/garmin/infrastructure/provider";

const GARMIN_DAILY_REPORT_TTL_MS = 1000 * 60 * 10;

export type GarminDailySnapshot = {
  date: string;
  fetchedAt: Date;
  cached: boolean;
  summary: {
    steps: number | null;
    distanceMeters: number | null;
    totalKilocalories: number | null;
    activeKilocalories: number | null;
    restingHeartRate: number | null;
    bodyBatteryHighest: number | null;
    bodyBatteryLowest: number | null;
  };
  sleep: {
    durationSeconds: number | null;
    score: number | null;
    avgSleepHrv: number | null;
  };
  hrv: {
    lastNightAvg: number | null;
    weeklyAvg: number | null;
    status: string | null;
  };
  readiness: {
    score: number | null;
    level: string | null;
    recoveryTimeMinutes: number | null;
    feedback: string | null;
  };
  warnings: string[];
};

const garminDailyReportCache = new Map<string, { expiresAt: number; value: GarminDailySnapshot | null }>();

export async function getGarminDailySnapshotForUser(userId: string, input?: { date?: Date | string }) {
  const date = typeof input?.date === "string" ? input.date : formatGarminDate(input?.date ?? new Date());
  const cacheKey = `${userId}:${date}`;
  const cached = garminDailyReportCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const connection = await prisma.wearableConnection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: WearableProvider.GARMIN,
      },
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (
    !connection
    || connection.status === ConnectionStatus.DISCONNECTED
    || connection.status === ConnectionStatus.RECONNECT_REQUIRED
  ) {
    garminDailyReportCache.set(cacheKey, {
      expiresAt: Date.now() + GARMIN_DAILY_REPORT_TTL_MS,
      value: null,
    });
    return null;
  }

  const secret = await prisma.wearableSecret.findUnique({
    where: {
      wearableConnectionId_secretType: {
        wearableConnectionId: connection.id,
        secretType: SecretType.GARMIN_API_KEY,
      },
    },
  });

  if (!secret) {
    return null;
  }

  try {
    const report = await garminProvider.getDailyReport({
      accountApiKey: decryptSecret(secret),
      date,
    });
    const snapshot = mapGarminDailySnapshot(report);

    garminDailyReportCache.set(cacheKey, {
      expiresAt: Date.now() + GARMIN_DAILY_REPORT_TTL_MS,
      value: snapshot,
    });

    return snapshot;
  } catch (error) {
    logger.warn("Garmin daily report unavailable", { error, userId, date });

    garminDailyReportCache.set(cacheKey, {
      expiresAt: Date.now() + 60 * 1000,
      value: null,
    });

    return null;
  }
}

export function hasGarminDailySnapshotData(snapshot: GarminDailySnapshot | null | undefined): snapshot is GarminDailySnapshot {
  if (!snapshot) {
    return false;
  }

  return [
    snapshot.summary.steps,
    snapshot.summary.distanceMeters,
    snapshot.summary.totalKilocalories,
    snapshot.summary.activeKilocalories,
    snapshot.summary.restingHeartRate,
    snapshot.summary.bodyBatteryHighest,
    snapshot.summary.bodyBatteryLowest,
    snapshot.sleep.durationSeconds,
    snapshot.sleep.score,
    snapshot.sleep.avgSleepHrv,
    snapshot.hrv.lastNightAvg,
    snapshot.hrv.weeklyAvg,
    snapshot.hrv.status,
    snapshot.readiness.score,
    snapshot.readiness.level,
    snapshot.readiness.recoveryTimeMinutes,
    snapshot.readiness.feedback,
  ].some((value) => value !== null && value !== undefined && value !== "") || snapshot.warnings.length > 0;
}

export function hasGarminDailySummaryMetrics(snapshot: GarminDailySnapshot | null | undefined): snapshot is GarminDailySnapshot {
  if (!snapshot) {
    return false;
  }

  const hasReadiness = snapshot.readiness.score !== null || !!snapshot.readiness.level || !!snapshot.readiness.feedback;
  const hasHeartRate = snapshot.summary.restingHeartRate !== null;
  const hasHrv = snapshot.hrv.lastNightAvg !== null || !!snapshot.hrv.status;
  const hasSleepScore = snapshot.sleep.score !== null;
  const hasBodyBattery = snapshot.summary.bodyBatteryHighest !== null || snapshot.summary.bodyBatteryLowest !== null;

  return hasReadiness && hasHeartRate && hasHrv && hasSleepScore && hasBodyBattery;
}

function mapGarminDailySnapshot(report: Awaited<ReturnType<typeof garminProvider.getDailyReport>>): GarminDailySnapshot {
  const summary = report.summary ?? {};
  const sleep = asRecord(report.health.sleep);
  const dailySleep = asRecord(sleep?.dailySleepDTO);
  const sleepScores = asRecord(dailySleep?.sleepScores);
  const overallSleep = asRecord(sleepScores?.overall);
  const hrv = asRecord(report.health.hrv);
  const hrvSummary = asRecord(hrv?.hrvSummary);
  const readiness = getLatestTrainingReadiness(report.training.training_readiness);

  return {
    date: report.date,
    fetchedAt: new Date(),
    cached: report.cached,
    summary: {
      steps: getNumber(summary.totalSteps),
      distanceMeters: getNumber(summary.totalDistanceMeters),
      totalKilocalories: getNumber(summary.totalKilocalories),
      activeKilocalories: getNumber(summary.activeKilocalories),
      restingHeartRate: getNumber(summary.restingHeartRate),
      bodyBatteryHighest: getNumber(summary.bodyBatteryHighestValue),
      bodyBatteryLowest: getNumber(summary.bodyBatteryLowestValue),
    },
    sleep: {
      durationSeconds: getNumber(dailySleep?.sleepTimeSeconds),
      score: getNumber(overallSleep?.value),
      avgSleepHrv: getNumber(dailySleep?.avgSleepHRV),
    },
    hrv: {
      lastNightAvg: getNumber(hrvSummary?.lastNightAvg),
      weeklyAvg: getNumber(hrvSummary?.weeklyAvg),
      status: getString(hrvSummary?.status),
    },
    readiness: {
      score: getNumber(readiness?.score),
      level: getString(readiness?.level),
      recoveryTimeMinutes: getNumber(readiness?.recoveryTime),
      feedback: getString(readiness?.feedbackShort) ?? getString(readiness?.feedbackLong),
    },
    warnings: Array.isArray(report.warnings)
      ? report.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
  };
}

function getLatestTrainingReadiness(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .sort((left, right) => {
        const leftTimestamp = Date.parse(getString(left.timestamp) ?? getString(left.timestampLocal) ?? "");
        const rightTimestamp = Date.parse(getString(right.timestamp) ?? getString(right.timestampLocal) ?? "");

        return (Number.isNaN(rightTimestamp) ? 0 : rightTimestamp) - (Number.isNaN(leftTimestamp) ? 0 : leftTimestamp);
      })[0] ?? null;
  }

  return asRecord(value);
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function formatGarminDate(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}
