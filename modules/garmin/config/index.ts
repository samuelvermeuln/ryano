/**
 * Barrel de configuração do módulo Garmin.
 *
 * _Requisitos: 5.1, 5.2_
 */

export {
  DEFAULT_GARMIN_JOB_INTERVAL_MINUTES,
  DEFAULT_GARMIN_MAX_MESSAGES_PER_DAY,
  DEFAULT_GARMIN_MAX_MESSAGES_PER_HOUR,
  DEFAULT_GARMIN_MAX_MESSAGES_PER_RUN,
  DEFAULT_GARMIN_MAX_PROBES_PER_RUN,
  DEFAULT_GARMIN_MAX_USERS_PER_RUN,
  DEFAULT_GARMIN_MESSAGE_DELAY_SECONDS,
  DEFAULT_GARMIN_SYNC_DELAY_SECONDS,
  getGarminJobRunSchedule,
  getGarminJobsRunEventType,
  getGarminReportingSettingsActionName,
  getStoredGarminReportingSettings,
  normalizeGarminReportingSettings,
} from "@/modules/garmin/config/garmin-reporting-settings";
export type { GarminReportingSettings } from "@/modules/garmin/config/garmin-reporting-settings";
