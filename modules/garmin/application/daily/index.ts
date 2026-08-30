/**
 * Barrel de application/daily do módulo Garmin.
 *
 * _Requisitos: 5.1, 5.2_
 */

export {
  getGarminDailySnapshotForUser,
  hasGarminDailySnapshotData,
  hasGarminDailySummaryMetrics,
} from "@/modules/garmin/application/daily/garmin-daily-report";
export type { GarminDailySnapshot } from "@/modules/garmin/application/daily/garmin-daily-report";
