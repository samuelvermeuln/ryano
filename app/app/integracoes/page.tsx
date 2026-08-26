import { IntegrationsHub } from "@/components/integrations/integrations-hub";
import { requireOnboardedUser } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { getLatestGarminReconnectNotification } from "@/server/services/garmin-service";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ garmin?: string }>;
}) {
  const user = await requireOnboardedUser();
  const params = await searchParams;
  const garminConnection = user.wearableConnections.find((connection) => connection.provider === "GARMIN") ?? null;
  const [latestReconnectNotification, latestActivity, latestWhatsAppSend] = await Promise.all([
    garminConnection?.status === "RECONNECT_REQUIRED"
      ? getLatestGarminReconnectNotification(user.id)
      : Promise.resolve(null),
    prisma.activity.findFirst({
      where: {
        userId: user.id,
        provider: "GARMIN",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        name: true,
        sportType: true,
        distanceMeters: true,
        durationSeconds: true,
      },
    }),
    prisma.messageDelivery.findFirst({
      where: {
        userId: user.id,
        channel: "WHATSAPP",
        provider: "EVOLUTION",
        status: {
          in: ["SENT", "DELIVERED"],
        },
        sentAt: {
          not: null,
        },
      },
      orderBy: {
        sentAt: "desc",
      },
      select: {
        sentAt: true,
      },
    }),
  ]);

  return (
    <IntegrationsHub
      key={[params.garmin ?? "default", garminConnection?.status ?? "none"].join(":")}
      garminConnection={
        garminConnection
          ? {
              status: garminConnection.status,
              lastSyncAt: garminConnection.lastSyncAt?.toISOString() ?? null,
              lastSyncStatus: garminConnection.lastSyncStatus,
              lastErrorCode: garminConnection.lastErrorCode,
            }
          : null
      }
      reconnectNotification={latestReconnectNotification
        ? {
            status: latestReconnectNotification.eventType === "GARMIN_RECONNECT_NOTIFICATION_SENT" ? "SENT" : "FAILED",
            createdAt: latestReconnectNotification.createdAt.toISOString(),
            reason: latestReconnectNotification.reason,
            errorCode: latestReconnectNotification.errorCode,
          }
        : null}
      whatsapp={{
        phone: user.whatsappIdentity?.phoneE164 ?? user.profile?.phoneE164 ?? null,
        verified: Boolean(user.whatsappIdentity?.verifiedAt),
        lastSentAt: latestWhatsAppSend?.sentAt?.toISOString() ?? null,
      }}
      automations={user.notificationPreference
        ? {
            enabled: user.notificationPreference.enabled,
            postActivityReport: user.notificationPreference.postActivityReport,
            dailySummary: user.notificationPreference.dailySummary,
            reportTime: user.notificationPreference.reportTime,
            timezone: user.notificationPreference.timezone,
          }
        : null}
      latestActivity={latestActivity}
      autoOpenGarminConnect={params.garmin === "revalidar" || garminConnection?.status === "RECONNECT_REQUIRED"}
    />
  );
}
