import type { Activity, WearableConnection, WhatsAppIdentity } from "@prisma/client";

import { prisma } from "@/server/db";
import { getGarminDailySnapshotForUser } from "@/server/services/garmin-daily-report";

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

function buildTrend(activities: Activity[], days: number) {
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

  const [periodActivities, recentActivities, connections, whatsappIdentity, garminToday] = await Promise.all([
    prisma.activity.findMany({
      where: {
        userId,
        startedAt: { gte: periodStart },
      },
      orderBy: { startedAt: "asc" },
    }),
    prisma.activity.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
    prisma.wearableConnection.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.whatsAppIdentity.findUnique({ where: { userId } }),
    getGarminDailySnapshotForUser(userId),
  ]);

  const typedPeriodActivities = periodActivities as Activity[];
  const typedRecentActivities = recentActivities as Activity[];
  const typedConnections = connections as WearableConnection[];
  const typedWhatsappIdentity = whatsappIdentity as WhatsAppIdentity | null;

  const totalDurationSeconds = typedPeriodActivities.reduce(
    (total: number, activity: Activity) => total + (activity.durationSeconds ?? 0),
    0,
  );
  const totalDistanceMeters = typedPeriodActivities.reduce(
    (total: number, activity: Activity) => total + (activity.distanceMeters ?? 0),
    0,
  );
  const trainingDays = new Set(
    typedPeriodActivities.map((activity) => activity.startedAt.toISOString().slice(0, 10)),
  ).size;
  const sportTypesCount = new Set(typedPeriodActivities.map((activity) => activity.sportType)).size;
  const latestActivity = typedRecentActivities[0] ?? null;
  const garminConnection =
    typedConnections.find((connection: WearableConnection) => connection.provider === "GARMIN") ?? null;
  const daysSinceLatestActivity = latestActivity
    ? Math.max(0, Math.floor((Date.now() - latestActivity.startedAt.getTime()) / DAY_IN_MS))
    : null;

  return {
    activities: typedRecentActivities,
    trend: buildTrend(typedPeriodActivities, days),
    summary: {
      days,
      periodStart,
      activityCount: typedPeriodActivities.length,
      totalDurationSeconds,
      totalDistanceMeters,
      trainingDays,
      sportTypesCount,
      latestActivity,
      daysSinceLatestActivity,
      garminConnection,
      garminToday,
      whatsappIdentity: typedWhatsappIdentity,
    },
  };
}
