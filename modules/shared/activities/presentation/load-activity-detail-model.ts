/**
 * SAM-40 — everything the activity screen needs, for one persisted
 * `Activity`: the legacy per-activity visual data (injected: the app layer
 * owns the Garmin → Strava splits fallback), the resolved rich detail of the
 * session (tables, every connection, SAM-45 resolution) and the athlete's
 * self-assessment. Any failure of a rich source degrades to the visual data,
 * never to a failed page.
 */
import type { Activity, PrismaClient } from "@prisma/client";
import { loadResolvedActivityDetail } from "../detail-ingestion";
import type { ResolvedActivityDetailSources } from "../source-resolution";
import { buildActivityDetailModel, type ActivityDetailModel } from "./activity-detail-model";
import type { ActivityVisualData } from "./activity-visual-data";

type ModelDb = Pick<PrismaClient, "activity" | "activityLap" | "activityZone" | "activityStream" | "athleteFeedback">;

/** The card layout the VIEWER saved for the activity screen (a reader preference). */
export async function loadSavedActivityLayout(
  db: Pick<PrismaClient, "userProfile">,
  viewerUserId: string,
): Promise<Array<string | { id: string; span?: number | null }> | undefined> {
  try {
    const profile = await db.userProfile.findUnique({ where: { userId: viewerUserId }, select: { activityLayoutOrder: true } });
    return Array.isArray(profile?.activityLayoutOrder)
      ? (profile.activityLayoutOrder as Array<string | { id: string; span?: number | null }>)
      : undefined;
  } catch {
    return undefined;
  }
}

export async function loadActivityDetailModel(
  db: ModelDb,
  activity: Activity,
  visualData: ActivityVisualData,
  providerLabel: (providerId: string) => string,
): Promise<ActivityDetailModel> {
  let rich: ResolvedActivityDetailSources | null = null;
  try {
    rich = await loadResolvedActivityDetail(db, activity);
  } catch {
    rich = null;
  }
  let feedback: ActivityDetailModel["feedback"] = null;
  try {
    const row = await db.athleteFeedback.findUnique({
      where: { activityId: activity.id },
      select: { rpe: true, mood: true, energy: true, comment: true },
    });
    feedback = row ?? null;
  } catch {
    feedback = null;
  }
  return buildActivityDetailModel({ activity, visualData, rich, feedback, providerLabel });
}
