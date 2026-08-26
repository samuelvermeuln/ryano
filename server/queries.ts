import type { Prisma } from "@prisma/client";
import { ConnectionStatus } from "@prisma/client";

import { prisma } from "@/server/db";
import { getGarminDailySnapshotForUser } from "@/server/services/garmin-daily-report";
import { getLatestGarminReconnectNotification } from "@/server/services/garmin-service";

const dashboardTrendActivitySelect = {
  startedAt: true,
  durationSeconds: true,
  distanceMeters: true,
  sportType: true,
} satisfies Prisma.ActivitySelect;

const dashboardLatestActivitySelect = {
  id: true,
  name: true,
  sportType: true,
  startedAt: true,
  durationSeconds: true,
  distanceMeters: true,
  calories: true,
  averageHeartRate: true,
  maxHeartRate: true,
  metrics: true,
} satisfies Prisma.ActivitySelect;

const dashboardGarminConnectionSelect = {
  status: true,
  lastSyncAt: true,
  lastSyncStatus: true,
} satisfies Prisma.WearableConnectionSelect;

const dashboardWhatsappIdentitySelect = {
  phoneE164: true,
  verifiedAt: true,
} satisfies Prisma.WhatsAppIdentitySelect;

type DashboardTrendActivity = Prisma.ActivityGetPayload<{ select: typeof dashboardTrendActivitySelect }>;
type DashboardGarminConnection = Prisma.WearableConnectionGetPayload<{ select: typeof dashboardGarminConnectionSelect }>;
type DashboardWhatsappIdentity = Prisma.WhatsAppIdentityGetPayload<{ select: typeof dashboardWhatsappIdentitySelect }>;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getPeriodStart(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function getBucketSize(days: number) {
  if (days <= 14) {
    return 1;
  }

  if (days <= 90) {
    return 7;
  }

  return 30;
}

function formatBucketLabel(date: Date, bucketSize: number) {
  if (bucketSize === 1) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date);
  }

  if (bucketSize === 7) {
    return `Semana de ${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date)}`;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function buildTrend(activities: DashboardTrendActivity[], days: number) {
  const bucketSize = getBucketSize(days);
  const periodStart = getPeriodStart(days);
  const bucketCount = Math.ceil(days / bucketSize);

  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(periodStart);
    bucketStart.setDate(periodStart.getDate() + index * bucketSize);

    return {
      label: formatBucketLabel(bucketStart, bucketSize),
      activityCount: 0,
      durationSeconds: 0,
      distanceMeters: 0,
    };
  });

  for (const activity of activities) {
    const diffDays = Math.floor((activity.startedAt.getTime() - periodStart.getTime()) / DAY_IN_MS);
    const bucketIndex = Math.max(0, Math.min(bucketCount - 1, Math.floor(diffDays / bucketSize)));
    const bucket = buckets[bucketIndex];

    bucket.activityCount += 1;
    bucket.durationSeconds += activity.durationSeconds ?? 0;
    bucket.distanceMeters += activity.distanceMeters ?? 0;
  }

  return buckets;
}

export async function getDashboardData(userId: string, days: number) {
  const periodStart = getPeriodStart(days);

  const [periodActivities, latestActivity, garminConnection, whatsappIdentity] = await Promise.all([
    prisma.activity.findMany({
      where: {
        userId,
        startedAt: { gte: periodStart },
      },
      orderBy: { startedAt: "asc" },
      select: dashboardTrendActivitySelect,
    }),
    prisma.activity.findFirst({
      where: { userId },
      orderBy: { startedAt: "desc" },
      select: dashboardLatestActivitySelect,
    }),
    prisma.wearableConnection.findFirst({
      where: {
        userId,
        provider: "GARMIN",
      },
      select: dashboardGarminConnectionSelect,
    }),
    prisma.whatsAppIdentity.findUnique({
      where: { userId },
      select: dashboardWhatsappIdentitySelect,
    }),
  ]);

  const [garminToday, latestGarminReconnectNotification] = await Promise.all([
    garminConnection && garminConnection.status !== ConnectionStatus.DISCONNECTED && garminConnection.status !== ConnectionStatus.RECONNECT_REQUIRED
      ? getGarminDailySnapshotForUser(userId)
      : Promise.resolve(null),
    garminConnection?.status === ConnectionStatus.RECONNECT_REQUIRED
      ? getLatestGarminReconnectNotification(userId)
      : Promise.resolve(null),
  ]);

  const totalDurationSeconds = periodActivities.reduce(
    (total, activity) => total + (activity.durationSeconds ?? 0),
    0,
  );
  const totalDistanceMeters = periodActivities.reduce(
    (total, activity) => total + (activity.distanceMeters ?? 0),
    0,
  );
  const trainingDays = new Set(
    periodActivities.map((activity) => activity.startedAt.toISOString().slice(0, 10)),
  ).size;
  const sportTypesCount = new Set(periodActivities.map((activity) => activity.sportType)).size;
  const sportCounts = periodActivities.reduce((accumulator, activity) => {
    const key = activity.sportType?.trim() || "Atividade";
    accumulator.set(key, (accumulator.get(key) ?? 0) + 1);
    return accumulator;
  }, new Map<string, number>());
  const predominantSport = [...sportCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  const daysSinceLatestActivity = latestActivity
    ? Math.max(0, Math.floor((Date.now() - latestActivity.startedAt.getTime()) / DAY_IN_MS))
    : null;

  return {
    latestActivity,
    trend: buildTrend(periodActivities, days),
    summary: {
      days,
      periodStart,
      activityCount: periodActivities.length,
      totalDurationSeconds,
      totalDistanceMeters,
      trainingDays,
      sportTypesCount,
      predominantSport,
      latestActivity,
      daysSinceLatestActivity,
      garminConnection: garminConnection as DashboardGarminConnection | null,
      garminToday,
      latestGarminReconnectNotification,
      whatsappIdentity: whatsappIdentity as DashboardWhatsappIdentity | null,
    },
  };
}
