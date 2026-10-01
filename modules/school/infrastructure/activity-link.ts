/**
 * SAM-17 — resolves the imported `Activity` an execution came from.
 *
 * `WorkoutExecution.source` is a free string written by whoever matched the
 * activity ("strava", "GARMIN", "self-report", "MANUAL"…), while
 * `Activity.provider` is the uppercase `WearableProvider` enum. The link is
 * therefore (UPPER(source), externalId, athleteId) → `Activity.id`, and only
 * when the source is a real provider: self-reports have no activity row.
 *
 * Provider-agnostic on purpose: no provider module is imported, the enum is
 * the catalogue of what can be an activity source.
 */
import { WearableProvider, type PrismaClient, type WorkoutMatchStatus } from "@prisma/client";

type ActivityDb = Pick<PrismaClient, "activity">;

export function toWearableProvider(source: string): WearableProvider | null {
  const upper = source.trim().toUpperCase();
  return (Object.values(WearableProvider) as string[]).includes(upper) ? (upper as WearableProvider) : null;
}

export async function resolveActivityId(
  db: ActivityDb,
  link: { source: string; externalId: string; athleteId: string },
): Promise<string | null> {
  const provider = toWearableProvider(link.source);
  if (!provider) return null;
  const activity = await db.activity.findUnique({
    where: { provider_externalId_userId: { provider, externalId: link.externalId, userId: link.athleteId } },
    select: { id: true },
  });
  return activity?.id ?? null;
}

/** The assignment-level pointer written whenever an execution becomes the matched one. */
export function matchedActivityData(execution: {
  activityId: string | null;
  matchStatus: WorkoutMatchStatus;
  matchScore: number;
}, now: Date) {
  return {
    matchedActivityId: execution.activityId,
    matchStatus: execution.matchStatus,
    matchedAt: now,
    matchScore: execution.matchScore,
  };
}

export const CLEARED_MATCH = {
  matchedActivityId: null,
  matchStatus: null,
  matchedAt: null,
  matchScore: null,
} as const;
