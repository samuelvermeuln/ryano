/**
 * SAM-42 — daily health, separated from the activity: persisted per
 * connection and local day (`AthleteDailyHealth`), ingested through the
 * registered `DailyHealthProvider` of each module, read back resolved one
 * source per field (SAM-45).
 */
export { DAILY_HEALTH_OPERATION, IngestDailyHealth, dailyHealthToRow, type IngestDailyHealthInput, type IngestDailyHealthResult } from "./ingest-daily-health";
export { loadDailyHealthRecords, loadResolvedDailyHealth, loadResolvedDailyHealthRange, rowToDailyHealth } from "./load-daily-health";
