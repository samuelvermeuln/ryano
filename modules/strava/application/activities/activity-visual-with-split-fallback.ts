/**
 * SAM-17 — the activity detail view with the Garmin → Strava splits fallback,
 * shared by the athlete's activity page and the coach's workout detail.
 *
 * Extracted from `app/app/(atleta)/atividades/[id]/page.tsx` unchanged in
 * behaviour: when a Garmin activity has no splits section (no API key, or the
 * device sent none) and the same session was also synced from Strava with its
 * laps already persisted, the Strava view is shown instead. Lives in the
 * Strava module because the fallback is Strava-specific; callers in `app/`
 * decide to use it, the provider-agnostic core never does.
 */
import type { Activity } from "@prisma/client";

import { getActivityVisualData } from "@/modules/shared/activities/presentation";
import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";
import { needsStravaActivityLapBackfill } from "@/modules/strava/application/activities/strava-activity-laps-cache";
import { findEquivalentPersistedStravaActivity } from "@/modules/strava/application/reporting/strava-split-fallback";

const SPLITS_SECTION_ID = "splits";

function hasSplits(visualData: ActivityVisualData): boolean {
  return visualData.barSections.some((section) => section.id === SPLITS_SECTION_ID);
}

export async function getActivityVisualDataWithSplitFallback(activity: Activity): Promise<ActivityVisualData> {
  const visualData = await getActivityVisualData(activity);
  if (activity.provider !== "GARMIN" || hasSplits(visualData)) return visualData;

  const stravaActivity = await findEquivalentPersistedStravaActivity({
    userId: activity.userId,
    sportType: activity.sportType,
    startedAt: activity.startedAt,
    distanceMeters: activity.distanceMeters,
    durationSeconds: activity.durationSeconds,
  });
  if (!stravaActivity || needsStravaActivityLapBackfill(stravaActivity.metrics)) return visualData;

  const stravaVisualData = await getActivityVisualData(stravaActivity);
  return hasSplits(stravaVisualData) ? stravaVisualData : visualData;
}
