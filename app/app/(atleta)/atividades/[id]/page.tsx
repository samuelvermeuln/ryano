import { notFound } from "next/navigation";

import { ActivityDetailView } from "@/components/activities/activity-detail-view";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
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
  // workout detail; see the helper for the rule. SAM-34 — the view itself is
  // shared with the coach and the school (`ActivityDetailView`).
  const visualData = await getActivityVisualDataWithSplitFallback(activity);

  return (
    <ActivityDetailView
      activityName={activity.name}
      visualData={visualData}
      viewer={{ name: session.user.name ?? session.user.email ?? "Usuário", image: session.user.image }}
      savedLayout={Array.isArray(profile?.activityLayoutOrder)
        ? (profile.activityLayoutOrder as Array<string | { id: string; span?: number | null }>)
        : undefined}
      layoutEditable
    />
  );
}
