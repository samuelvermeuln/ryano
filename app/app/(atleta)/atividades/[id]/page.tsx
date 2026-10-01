import { notFound } from "next/navigation";

import { ActivityVisualDashboard } from "@/components/activities/activity-visual-dashboard";
import { humanizeActivityLabel } from "@/lib/activity-text";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { ProviderId } from "@/modules/shared/integrations/types";
import { getActivityVisualDataWithSplitFallback } from "@/modules/strava/application/activities/activity-visual-with-split-fallback";

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireOnboardedSession();
  const { id } = await params;

  const [activity, profile] = await Promise.all([
    prisma.activity.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    }),
    prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { activityLayoutOrder: true },
    }),
  ]);

  if (!activity) {
    notFound();
  }

  // SAM-17 — the Garmin → Strava splits fallback is shared with the coach's
  // workout detail; see the helper for the rule.
  const visualData = await getActivityVisualDataWithSplitFallback(activity);
  // Rótulo de origem legível a partir do catálogo (ex.: "Strava", "Garmin"),
  // evitando exibir o valor bruto do enum (`STRAVA`/`GARMIN`) no badge.
  const providerLabel =
    getProviderDefinition(visualData.provider as ProviderId)?.name ?? visualData.provider;

  return (
    <ActivityVisualDashboard
      userName={session.user.name ?? session.user.email ?? "Usuário"}
      userImage={session.user.image}
      title={humanizeActivityLabel(activity.name) ?? visualData.sportLabel}
      sportLabel={visualData.sportLabel}
      provider={providerLabel}
      providerId={visualData.provider}
      startedAtLabel={visualData.startedAtLabel}
      heroStats={visualData.heroStats}
      overviewMetrics={visualData.overviewMetrics}
      barSections={visualData.barSections}
      metricSections={visualData.metricSections}
      savedLayout={Array.isArray(profile?.activityLayoutOrder)
        ? (profile.activityLayoutOrder as Array<string | { id: string; span?: number | null }>)
        : undefined}
    />
  );
}
