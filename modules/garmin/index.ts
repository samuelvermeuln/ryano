/**
 * Superfície pública do módulo Garmin.
 *
 * Superfície pública COMPLETA do módulo (finalizada na tarefa 2.5). Todos os
 * consumidores de produção (rotas em `app/api/integrations/garmin/**`,
 * `app/actions/*`, `server/queries.ts`, `app/admin/*`, páginas e componentes)
 * importam a partir deste barrel; as rotas permanecem adapters finos, apenas
 * delegando para estas funções.
 *
 * Exceção deliberada para evitar reintroduzir o ciclo Garmin ↔ reporting
 * quebrado na tarefa 2.4: `server/services/report-builder.ts` importa direto de
 * `@/modules/garmin/domain/errors` e `@/modules/garmin/application/daily`
 * (subpaths folha), pois ele é consumido pela camada `application/reporting`
 * reexportada aqui.
 *
 * Os únicos shims remanescentes em `server/` (`garmin-service.ts` e
 * `activity-normalizer.ts`) existem apenas para os testes e serão religados na
 * tarefa 2.6.
 *
 * _Requisitos: 5.1, 5.2, 5.3, 5.4_
 */

// Camada HTTP / provider (tarefa 2.1)
export { GarminProvider } from "@/modules/garmin/api/client/garmin-client";
export { garminProvider } from "@/modules/garmin/infrastructure/provider";

// Normalização (tarefa 2.2)
export {
  normalizeGarminActivity,
  parseGarminActivity,
} from "@/modules/garmin/parsers/parse-garmin-activity";
export { parseGarminSportType } from "@/modules/garmin/parsers/parse-garmin-sport-type";

// Application — connect / sync / disconnect / notifications (tarefa 2.3)
export { connectGarminForUser } from "@/modules/garmin/application/connect";
export {
  getGarminActivityExternalIdForProbe,
  getGarminProbeIntervalMs,
  getNextGarminProbeErrorAt,
  getNextGarminSyncQueuePreview,
  isRecentGarminActivityForReport,
  shouldRunGarminSyncForProbe,
  syncAllGarminUsers,
  syncGarminForUser,
} from "@/modules/garmin/application/sync";
export { disconnectGarminForUser } from "@/modules/garmin/application/disconnect";
// Application — camada de relatórios (tarefa 2.4)
export {
  enqueueDueDailyGarminSummaries,
  enqueueGarminReconnectReport,
  getGarminPostActivitySplits,
  registerGarminReporting,
} from "@/modules/garmin/application/reporting";
export {
  GARMIN_RECONNECT_NOTIFICATION_COOLDOWN_MS,
  getGarminReconnectNotificationCooldown,
  getLatestGarminReconnectNotification,
  sendGarminReconnectNotification,
} from "@/modules/garmin/application/notifications";
export type {
  GarminReconnectNotificationSummary,
  GarminSyncBatchResult,
} from "@/modules/garmin/application/garmin-service";

// Application — daily snapshot (tarefa 2.3)
export {
  getGarminDailySnapshotForUser,
  hasGarminDailySnapshotData,
  hasGarminDailySummaryMetrics,
} from "@/modules/garmin/application/daily";
export type { GarminDailySnapshot } from "@/modules/garmin/application/daily";

// Application — detalhe de atividade + view-models (tarefa 2.3)
export { getGarminActivityVisualData } from "@/modules/garmin/application/activities";
export type {
  ActivityBarSection,
  ActivityHeroStat,
  ActivityMetricRow,
  ActivityMetricSection,
  GarminActivityVisualData,
} from "@/modules/garmin/presentation/view-models";

// Config — reporting settings (tarefa 2.3)
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
} from "@/modules/garmin/config";
export type { GarminReportingSettings } from "@/modules/garmin/config";

// Domain — errors / events (tarefa 2.3)
export { isGarminAccountLockedErrorCode } from "@/modules/garmin/domain/errors";
export {
  GARMIN_RECONNECT_NOTIFICATION_FAILED_EVENT,
  GARMIN_RECONNECT_NOTIFICATION_SENT_EVENT,
} from "@/modules/garmin/domain/events";

// Domain — tipos legados do provider (tarefa 2.1)
export type {
  GarminDailyReportResult,
  WearableCapability,
  WearableConnectionResult,
  WearableProviderContract,
  WearableReconnectResult,
  WearableSyncResult,
} from "@/modules/garmin/domain/types";
