import { IntegrationsHub } from "@/components/integrations/integrations-hub";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { getLatestGarminReconnectNotification } from "@/server/services/garmin-service";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ garmin?: string }>;
}) {
  const session = await requireOnboardedSession();
  const params = await searchParams;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      name: true,
      image: true,
      profile: {
        select: {
          phoneE164: true,
        },
      },
      whatsappIdentity: {
        select: {
          phoneE164: true,
          verifiedAt: true,
        },
      },
      notificationPreference: {
        select: {
          enabled: true,
          postActivityReport: true,
          dailySummary: true,
          reportTime: true,
          timezone: true,
        },
      },
      wearableConnections: {
        where: {
          provider: "GARMIN",
        },
        select: {
          status: true,
          lastSyncAt: true,
          lastSyncStatus: true,
          lastErrorCode: true,
        },
      },
    },
  });

  const garminConnection = user?.wearableConnections[0] ?? null;
  const [latestReconnectNotification, latestActivity, latestWhatsAppSend] = await Promise.all([
    garminConnection?.status === "RECONNECT_REQUIRED"
      ? getLatestGarminReconnectNotification(session.user.id)
      : Promise.resolve(null),
    prisma.activity.findFirst({
      where: {
        userId: session.user.id,
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
        userId: session.user.id,
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
      userName={user.name ?? session.user.name ?? session.user.email ?? "Usuário"}
      userImage={user.image ?? session.user.image}
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
