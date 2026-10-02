import { notFound } from "next/navigation";

import { ActivityDetailView, activityProviderLabel } from "@/components/activities/activity-detail-view";
import { loadActivityDetailModel } from "@/modules/shared/activities/presentation/load-activity-detail-model";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { getActivityVisualDataWithSplitFallback } from "@/modules/strava/application/activities/activity-visual-with-split-fallback";

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireOnboardedSession();
  const { id } = await params;

  const activity = await prisma.activity.findFirst({ where: { id, userId: session.user.id } });
  if (!activity) {
    notFound();
  }

  // SAM-17 — the Garmin → Strava splits fallback is shared with the coach's
  // workout detail; see the helper for the rule. SAM-40 — the screen itself is
  // the shared `ActivityDetailView` fed by the rich detail model.
  const visualData = await getActivityVisualDataWithSplitFallback(activity);
  const model = await loadActivityDetailModel(prisma, activity, visualData, activityProviderLabel);

  return (
    <ActivityDetailView
      model={model}
      athlete={{ name: session.user.name ?? session.user.email ?? "Usuário", image: session.user.image }}
      viewerKind="athlete"
    />
  );
}
