/**
 * Barrel do sync/backfill de atividades do Strava (Task 6.4).
 *
 * _Requisitos: 11.6, 15.3, 16.2, 18.1_
 */

export { syncStravaForUser } from "@/modules/strava/application/sync/sync-strava";
export type {
  StravaSyncMode,
  StravaSyncStatus,
  SyncStravaForUserInput,
  SyncStravaResult,
} from "@/modules/strava/application/sync/sync-strava";

export { syncAllStravaUsers } from "@/modules/strava/application/sync/sync-all-strava";
export type {
  SyncAllStravaUsersInput,
  SyncAllStravaUsersResult,
  SyncStravaUserOutcome,
} from "@/modules/strava/application/sync/sync-all-strava";
