import Link from "next/link";
import { DashboardRedesign } from "@/components/dashboard/dashboard-redesign";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { getDashboardData } from "@/server/queries";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

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

  const session = await requireOnboardedSession();
  const schoolEnabled = isSchoolModuleEnabled();
  const [{ latestActivity, summary, trend, connectedProviders }, profile, deactivatedSchools] = await Promise.all([
    getDashboardData(session.user.id, selectedDays),
    prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { dashboardLayoutOrder: true },
    }),
    // Find schools that were deactivated while this user had an active athlete membership
    schoolEnabled
      ? prisma.schoolAthleteMembership.findMany({
          where: {
            athleteId: session.user.id,
            status: "ENDED",
            school: { status: "INACTIVE" },
          },
          include: { school: { select: { id: true, name: true } } },
          orderBy: { endedAt: "desc" },
          take: 3,
        })
      : Promise.resolve([]),
  ]);
  const peakWeek = trend
    .filter((bucket) => bucket.activityCount > 0)
    .sort((left, right) => {
      if (right.activityCount !== left.activityCount) {
        return right.activityCount - left.activityCount;
      }

      return right.durationSeconds - left.durationSeconds;
    })[0] ?? null;

  const alerts = [
    connectedProviders.length === 0
      ? "Conecte uma integração para importar seus treinos automaticamente."
      : null,
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
    <>
      {deactivatedSchools.length > 0 && (
        <div className="mb-0 px-4 pt-4 md:px-6 md:pt-6 space-y-2">
          {deactivatedSchools.map((m) => (
            <div key={m.id} className="rounded-xl border border-destructive/40 bg-destructive/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-destructive">Escola desativada</p>
                <p className="text-xs text-foreground/70 mt-0.5">
                  A escola <strong>{m.school.name}</strong> foi desativada e sua matrícula foi encerrada.
                </p>
              </div>
              <Link
                href="/escola/buscar"
                className="shrink-0 text-xs font-medium rounded-lg bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 transition-opacity"
              >
                Encontrar nova escola
              </Link>
            </div>
          ))}
        </div>
      )}
    <DashboardRedesign
      userFirstName={(session.user.name ?? session.user.email ?? "Usuário").split(" ")[0]}
      userName={session.user.name ?? session.user.email ?? "Usuário"}
      userImage={session.user.image}
      selectedDays={selectedDays}
      activityCount={summary.activityCount}
      peakWeekLabel={peakWeek?.label ?? null}
      peakWeekActivityCount={peakWeek?.activityCount ?? null}
      peakWeekDurationSeconds={peakWeek?.durationSeconds ?? null}
      alerts={alerts}
      trend={trend}
      latestActivity={latestActivity
        ? {
            id: latestActivity.id,
            name: latestActivity.name,
            sportType: latestActivity.sportType,
            startedAt: latestActivity.startedAt.toISOString(),
            durationSeconds: latestActivity.durationSeconds,
            distanceMeters: latestActivity.distanceMeters,
            calories: latestActivity.calories,
            averageHeartRate: latestActivity.averageHeartRate,
            maxHeartRate: latestActivity.maxHeartRate,
            metrics: latestActivity.metrics && typeof latestActivity.metrics === "object" && !Array.isArray(latestActivity.metrics)
              ? latestActivity.metrics as Record<string, unknown>
              : null,
          }
        : null}
      savedLayout={Array.isArray(profile?.dashboardLayoutOrder)
        ? (profile.dashboardLayoutOrder as Array<string | { id: string; span?: number | null }>)
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
    </>
  );
}
