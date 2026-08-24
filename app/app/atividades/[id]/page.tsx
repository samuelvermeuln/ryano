import { notFound } from "next/navigation";

import { ActivityVisualDashboard } from "@/components/activities/activity-visual-dashboard";
import { requireOnboardedUser } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { getGarminActivityVisualData } from "@/server/services/garmin-activity-details";

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;

  const activity = await prisma.activity.findFirst({
    where: {
      id,
      userId: user.id,
    },
  });

  if (!activity) {
    notFound();
  }

  const visualData = await getGarminActivityVisualData(activity);

  return visualData ? (
    <ActivityVisualDashboard
      title={activity.name ?? visualData.sportLabel}
      sportLabel={visualData.sportLabel}
      provider={visualData.provider}
      startedAtLabel={visualData.startedAtLabel}
      heroStats={visualData.heroStats}
      overviewMetrics={visualData.overviewMetrics}
      barSections={visualData.barSections}
      metricSections={visualData.metricSections}
      savedLayout={Array.isArray(user.profile?.activityLayoutOrder)
        ? (user.profile.activityLayoutOrder as Array<string | { id: string; span?: number | null }>)
        : undefined}
    />
  ) : null;
}
