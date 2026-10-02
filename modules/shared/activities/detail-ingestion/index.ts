/**
 * SAM-39 — rich-detail ingestion (provider-agnostic): persist a canonical
 * `NormalizedActivityDetail` into ActivityLap/ActivityZone/ActivityStream and
 * the extended stats, deriving what the core can derive. Providers only
 * produce the DTO; see `modules/<provider>/application/activities/*-activity-detail-provider.ts`.
 */
export { deriveHeartRateZoneSet, heartRateSamplesFromStreams } from "./derive-heart-rate-zones";
export {
  ACTIVITY_DETAIL_OPERATION,
  completeDetail,
  ingestActivityDetail,
  type ActivityDetailLoader,
  type DetailActivity,
  type IngestActivityDetailOptions,
  type IngestActivityDetailResult,
} from "./ingest-activity-detail";
export { persistActivityDetail, statsToActivityUpdate, type PersistActivityDetailResult } from "./persist-activity-detail";
export { loadPersistedActivityDetail, type PersistedActivityDetail } from "./load-persisted-activity-detail";
