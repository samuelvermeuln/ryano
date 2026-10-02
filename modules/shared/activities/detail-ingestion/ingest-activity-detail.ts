/**
 * SAM-39 — the one ingestion step every provider runs after it has persisted
 * an `Activity`: obtain the canonical detail from the provider module (a
 * function the caller injects — the core never imports a provider), derive
 * what the core can derive (heart-rate zones from a heart-rate stream when the
 * provider has none), persist into the rich model and log. Never throws: a
 * sync must finish even when the detail is unavailable, and the backfill can
 * retry later because `detailSyncedAt` stays null.
 */
import type { Activity, PrismaClient } from "@prisma/client";
import { logIntegrationEvent } from "@/modules/shared/integrations/observability/log";
import type { ProviderId } from "@/modules/shared/integrations/types";
import type { NormalizedActivityDetail } from "../contracts/rich";
import { deriveHeartRateZoneSet } from "./derive-heart-rate-zones";
import { persistActivityDetail, type PersistActivityDetailResult } from "./persist-activity-detail";

export const ACTIVITY_DETAIL_OPERATION = "activity_detail_ingestion";

export type DetailActivity = Pick<
  Activity,
  "id" | "userId" | "wearableConnectionId" | "provider" | "externalId" | "maxHeartRate" | "averageHeartRate" | "detailSyncedAt"
>;

export type ActivityDetailLoader = () => Promise<NormalizedActivityDetail | null>;

export type IngestActivityDetailResult =
  | { status: "ingested"; persisted: PersistActivityDetailResult; derivedZones: boolean }
  | { status: "skipped"; reason: "already-synced" | "no-detail" }
  | { status: "failed"; errorName: string; rateLimited: boolean };

export type IngestActivityDetailOptions = {
  /** Re-ingest even when `detailSyncedAt` is set (backfill `--all`). */
  force?: boolean;
  now?: () => Date;
  /** Marks a 429 so the caller (backfill) stops instead of burning quota. */
  isRateLimitError?: (error: unknown) => boolean;
};

/** Adds derived HR zones when the provider sent none and a usable HR stream exists. */
export function completeDetail(detail: NormalizedActivityDetail, activity: Pick<DetailActivity, "maxHeartRate" | "averageHeartRate">): { detail: NormalizedActivityDetail; derivedZones: boolean } {
  if (detail.zones.some((set) => set.zoneType === "HEART_RATE")) return { detail, derivedZones: false };
  const derived = deriveHeartRateZoneSet(detail, { maxHeartRate: activity.maxHeartRate, averageHeartRate: activity.averageHeartRate });
  if (!derived) return { detail, derivedZones: false };
  return {
    detail: { ...detail, zones: [...detail.zones, derived], sources: { ...detail.sources, zones: derived.source } },
    derivedZones: true,
  };
}

export async function ingestActivityDetail(
  db: Pick<PrismaClient, "$transaction">,
  activity: DetailActivity,
  loadDetail: ActivityDetailLoader,
  options: IngestActivityDetailOptions = {},
): Promise<IngestActivityDetailResult> {
  const provider = activity.provider as ProviderId;
  const now = options.now ?? (() => new Date());
  if (activity.detailSyncedAt && !options.force) {
    return { status: "skipped", reason: "already-synced" };
  }
  try {
    const raw = await loadDetail();
    if (!raw) {
      logIntegrationEvent("info", "Activity detail unavailable", {
        provider, operation: ACTIVITY_DETAIL_OPERATION, status: "no_data",
        connectionId: activity.wearableConnectionId, activityId: activity.id,
      });
      return { status: "skipped", reason: "no-detail" };
    }
    const { detail, derivedZones } = completeDetail(raw, activity);
    const persisted = await persistActivityDetail(db, activity.id, detail, now());
    logIntegrationEvent("info", "Activity detail ingested", {
      provider, operation: ACTIVITY_DETAIL_OPERATION, status: "ok",
      connectionId: activity.wearableConnectionId, activityId: activity.id,
      laps: persisted.laps, zones: persisted.zones, streams: persisted.streams, derivedZones,
    });
    return { status: "ingested", persisted, derivedZones };
  } catch (error) {
    const rateLimited = options.isRateLimitError?.(error) ?? false;
    logIntegrationEvent("warn", "Activity detail ingestion failed", {
      provider, operation: ACTIVITY_DETAIL_OPERATION, status: rateLimited ? "rate_limited" : "error",
      connectionId: activity.wearableConnectionId, activityId: activity.id,
      errorName: error instanceof Error ? error.name : "Error",
    });
    return { status: "failed", errorName: error instanceof Error ? error.name : "Error", rateLimited };
  }
}
