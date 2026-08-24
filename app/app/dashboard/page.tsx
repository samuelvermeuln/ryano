import { DashboardRedesign } from "@/components/dashboard/dashboard-redesign";
import { requireOnboardedUser } from "@/server/auth-guards";
import { getDashboardData } from "@/server/queries";

export const dynamic = "force-dynamic";

const PERIOD_OPTIONS = [7, 30, 90, 365] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const selectedDays = (PERIOD_OPTIONS.includes(Number(params.days) as (typeof PERIOD_OPTIONS)[number])
    ? Number(params.days)
    : 30) as (typeof PERIOD_OPTIONS)[number];

  const user = await requireOnboardedUser();
  const { activities, summary, trend } = await getDashboardData(user.id, selectedDays);
  const peakWeek = trend
    .filter((bucket) => bucket.activityCount > 0)
    .sort((left, right) => {
      if (right.activityCount !== left.activityCount) {
        return right.activityCount - left.activityCount;
      }

      return right.durationSeconds - left.durationSeconds;
    })[0] ?? null;

  const alerts = [
    !summary.garminConnection ? "Conecte seu Garmin para importar seus treinos automaticamente." : null,
    summary.garminConnection?.status === "RECONNECT_REQUIRED" ? "Sua conexão com o Garmin precisa ser refeita." : null,
    summary.garminConnection?.status === "CONNECTED" && !summary.garminToday
      ? "Conexão Garmin ativa, mas a leitura diária ainda não ficou disponível."
      : null,
    !summary.whatsappIdentity?.verifiedAt ? "Ative seu WhatsApp para receber seus resumos por lá." : null,
    summary.daysSinceLatestActivity !== null && summary.daysSinceLatestActivity > 14
      ? `Faz ${summary.daysSinceLatestActivity} dias que não recebemos novas atividades.`
      : null,
  ].filter(Boolean) as string[];

  return (
    <DashboardRedesign
      userFirstName={(user.name ?? user.email).split(" ")[0]}
      selectedDays={selectedDays}
      activityCount={summary.activityCount}
      peakWeekLabel={peakWeek?.label ?? null}
      peakWeekActivityCount={peakWeek?.activityCount ?? null}
      peakWeekDurationSeconds={peakWeek?.durationSeconds ?? null}
      alerts={alerts}
      trend={trend}
      latestActivity={activities[0]
        ? {
            id: activities[0].id,
            name: activities[0].name,
            sportType: activities[0].sportType,
            startedAt: activities[0].startedAt.toISOString(),
            durationSeconds: activities[0].durationSeconds,
            distanceMeters: activities[0].distanceMeters,
            calories: activities[0].calories,
            averageHeartRate: activities[0].averageHeartRate,
            maxHeartRate: activities[0].maxHeartRate,
            metrics: activities[0].metrics && typeof activities[0].metrics === "object" && !Array.isArray(activities[0].metrics)
              ? activities[0].metrics as Record<string, unknown>
              : null,
          }
        : null}
      savedLayout={Array.isArray(user.profile?.dashboardLayoutOrder)
        ? (user.profile.dashboardLayoutOrder as Array<string | { id: string; span?: number | null }>)
        : undefined}
      summary={{
        predominantSport: summary.predominantSport,
        totalDurationSeconds: summary.totalDurationSeconds,
        totalDistanceMeters: summary.totalDistanceMeters,
        trainingDays: summary.trainingDays,
        garminConnection: summary.garminConnection
          ? {
              status: summary.garminConnection.status,
              lastSyncAt: summary.garminConnection.lastSyncAt?.toISOString() ?? null,
              lastSyncStatus: summary.garminConnection.lastSyncStatus ?? null,
            }
          : null,
        latestGarminReconnectNotification: summary.latestGarminReconnectNotification
          ? {
              createdAt: summary.latestGarminReconnectNotification.createdAt.toISOString(),
            }
          : null,
        whatsappIdentity: summary.whatsappIdentity
          ? {
              verifiedAt: summary.whatsappIdentity.verifiedAt?.toISOString() ?? null,
              phoneE164: summary.whatsappIdentity.phoneE164,
            }
          : null,
        garminToday: summary.garminToday
          ? {
              summary: summary.garminToday.summary,
              sleep: summary.garminToday.sleep,
              hrv: summary.garminToday.hrv,
              readiness: summary.garminToday.readiness,
              warnings: summary.garminToday.warnings,
            }
          : null,
      }}
    />
  );
}
