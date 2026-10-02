/**
 * SAM-40 — the rich detail a screen consumes: every persisted candidate of
 * the session (this activity plus the copies of the same session recorded by
 * other connections, SAM-39 `duplicateOfActivityId`) resolved by
 * `resolveActivityDetailSources` (SAM-45) under the provider's policy. One
 * session, one detail, each block labelled with its source. `null` when
 * nothing rich was ingested yet — the screen then falls back to the legacy
 * enrichment of that activity, never to a provider decision.
 */
import type { Activity, PrismaClient } from "@prisma/client";
import { getProviderPolicy } from "@/modules/shared/integrations/policy";
import type { ProviderId } from "@/modules/shared/integrations/types";
import { resolveActivityDetailSources, type ResolvedActivityDetailSources } from "../source-resolution";
import { loadPersistedActivityDetail } from "./load-persisted-activity-detail";

type ResolvedDetailDb = Pick<PrismaClient, "activity" | "activityLap" | "activityZone" | "activityStream">;

export type SessionActivity = Pick<Activity, "id" | "externalId" | "provider" | "duplicateOfActivityId">;

/** The activity and every other copy of the same session (kept one + mirrors). */
export async function listSessionActivities(db: Pick<PrismaClient, "activity">, activity: SessionActivity): Promise<SessionActivity[]> {
  const keptId = activity.duplicateOfActivityId ?? activity.id;
  const rows = await db.activity.findMany({
    where: { OR: [{ id: keptId }, { duplicateOfActivityId: keptId }] },
    select: { id: true, externalId: true, provider: true, duplicateOfActivityId: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  byId.set(activity.id, activity);
  return [...byId.values()];
}

export async function loadResolvedActivityDetail(
  db: ResolvedDetailDb,
  activity: SessionActivity,
  options: { preferred?: readonly ProviderId[] } = {},
): Promise<ResolvedActivityDetailSources | null> {
  const session = await listSessionActivities(db, activity);
  const persisted = await Promise.all(session.map((row) => loadPersistedActivityDetail(db, row)));
  const candidates = persisted.flat();
  if (candidates.length === 0) return null;
  return resolveActivityDetailSources(candidates, {
    preferred: options.preferred ?? [activity.provider as ProviderId],
    combinationAllowed: getProviderPolicy(activity.provider as ProviderId).allowCrossProviderCombination,
  });
}
