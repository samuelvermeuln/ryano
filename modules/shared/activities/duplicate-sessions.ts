/**
 * SAM-39 — the same session arriving from two connections (a Garmin workout
 * mirrored into Strava, for instance) is ONE session: the second copy is
 * marked `duplicateOfActivityId` → the kept one, so lists, calendars and the
 * matching show and match it once. Provider-agnostic: which copy is kept comes
 * from `findDuplicateSessions` (athlete preference → catalog order), never
 * from a provider literal. Never throws — a sync must finish regardless.
 *
 * Rows are never merged or deleted (ADR-003/ADR-005): the duplicate keeps its
 * own data, it is only hidden behind the kept activity.
 */
import type { Activity, PrismaClient } from "@prisma/client";
import { PROVIDERS } from "@/modules/shared/integrations/catalog";
import { logIntegrationEvent } from "@/modules/shared/integrations/observability/log";
import type { ProviderId } from "@/modules/shared/integrations/types";
import { sessionFingerprintSchema, type SessionFingerprint } from "./contracts/rich";
import { findDuplicateSessions, type DuplicateSessionOptions } from "./source-resolution";
import { isRyvanoSportType } from "./sport-types";

export const DUPLICATE_SESSION_OPERATION = "duplicate_session";

/** Window around the activity start inside which a mirror is looked for. */
const DEFAULT_START_DELTA_MS = 10 * 60_000;

/**
 * Which copy is kept when the athlete has no stated preference: the catalog
 * order (`rankProviders` itself only knows the order it is given — SAM-45
 * leaves "athlete preference, then catalog" to the caller).
 */
function catalogOrder(): ProviderId[] {
  return PROVIDERS.map((definition) => definition.id);
}

export type DuplicateCandidate = Pick<
  Activity,
  "id" | "userId" | "wearableConnectionId" | "provider" | "sportType" | "startedAt" | "durationSeconds" | "distanceMeters" | "duplicateOfActivityId"
>;

export type MarkDuplicateSessionResult =
  | { status: "unchanged" }
  | { status: "marked"; duplicateId: string; keepId: string }
  | { status: "failed"; errorName: string };

function toFingerprint(activity: DuplicateCandidate): SessionFingerprint | null {
  const sportType = activity.sportType?.trim().toLowerCase();
  if (!sportType || !isRyvanoSportType(sportType)) return null;
  const parsed = sessionFingerprintSchema.safeParse({
    id: activity.id,
    provider: activity.provider,
    sportType,
    startedAt: activity.startedAt,
    durationSeconds: activity.durationSeconds,
    distanceMeters: activity.distanceMeters,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Looks at the athlete's activities from OTHER providers around the same
 * start and marks the duplicate pair (if any). Idempotent: an activity already
 * marked, or whose mirror is already marked, is left alone.
 */
export async function markDuplicateSession(
  db: Pick<PrismaClient, "activity">,
  activity: DuplicateCandidate,
  options: DuplicateSessionOptions = {},
): Promise<MarkDuplicateSessionResult> {
  const provider = activity.provider as ProviderId;
  try {
    if (activity.duplicateOfActivityId) return { status: "unchanged" };
    const self = toFingerprint(activity);
    if (!self) return { status: "unchanged" };

    const delta = options.maxStartDeltaMs ?? DEFAULT_START_DELTA_MS;
    const neighbours = await db.activity.findMany({
      where: {
        userId: activity.userId,
        id: { not: activity.id },
        provider: { not: activity.provider },
        startedAt: { gte: new Date(activity.startedAt.getTime() - delta), lte: new Date(activity.startedAt.getTime() + delta) },
      },
      select: { id: true, userId: true, wearableConnectionId: true, provider: true, sportType: true, startedAt: true, durationSeconds: true, distanceMeters: true, duplicateOfActivityId: true },
    });
    const others = neighbours
      .filter((row) => row.duplicateOfActivityId === null)
      .map(toFingerprint)
      .filter((fingerprint): fingerprint is SessionFingerprint => fingerprint !== null);
    if (others.length === 0) return { status: "unchanged" };

    const preferred = [...(options.preferred ?? []), ...catalogOrder()];
    const pair = findDuplicateSessions([self, ...others], { ...options, preferred, maxStartDeltaMs: delta })
      .find((candidate) => candidate.keepId === activity.id || candidate.duplicateId === activity.id);
    if (!pair) return { status: "unchanged" };

    await db.activity.update({ where: { id: pair.duplicateId }, data: { duplicateOfActivityId: pair.keepId } });
    logIntegrationEvent("info", "Duplicate session marked", {
      provider, operation: DUPLICATE_SESSION_OPERATION, status: "marked",
      connectionId: activity.wearableConnectionId, activityId: activity.id,
      keepProvider: pair.keepProvider, duplicateProvider: pair.duplicateProvider,
    });
    return { status: "marked", duplicateId: pair.duplicateId, keepId: pair.keepId };
  } catch (error) {
    logIntegrationEvent("warn", "Duplicate session check unavailable", {
      provider, operation: DUPLICATE_SESSION_OPERATION, status: "error",
      connectionId: activity.wearableConnectionId, activityId: activity.id,
      errorName: error instanceof Error ? error.name : "Error",
    });
    return { status: "failed", errorName: error instanceof Error ? error.name : "Error" };
  }
}
