import type { Activity, WearableConnection, WhatsAppIdentity } from "@prisma/client";

import { prisma } from "@/server/db";

export async function getDashboardData(userId: string) {
  const [activities, connections, whatsappIdentity] = await Promise.all([
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
  ]);

  const typedActivities = activities as Activity[];
  const typedConnections = connections as WearableConnection[];
  const typedWhatsappIdentity = whatsappIdentity as WhatsAppIdentity | null;

  const activityCount = typedActivities.length;
  const totalDurationSeconds = typedActivities.reduce(
    (total: number, activity: Activity) => total + (activity.durationSeconds ?? 0),
    0,
  );
  const totalDistanceMeters = typedActivities.reduce(
    (total: number, activity: Activity) => total + (activity.distanceMeters ?? 0),
    0,
  );
  const latestActivity = typedActivities[0] ?? null;
  const garminConnection =
    typedConnections.find((connection: WearableConnection) => connection.provider === "GARMIN") ?? null;

  return {
    activities: typedActivities,
    summary: {
      activityCount,
      totalDurationSeconds,
      totalDistanceMeters,
      latestActivity,
      garminConnection,
      whatsappIdentity: typedWhatsappIdentity,
    },
  };
}
