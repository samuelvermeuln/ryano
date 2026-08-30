/**
 * Concern de sincronização/probe do Garmin (application/sync).
 *
 * Reexporta a parte de "sync" do serviço canônico
 * (`modules/garmin/application/garmin-service.ts`). Implementação unificada por
 * acoplamento interno; comportamento preservado (Requisito 5.6).
 *
 * _Requisitos: 5.1, 5.2_
 */

export {
  getGarminActivityExternalIdForProbe,
  getGarminProbeIntervalMs,
  getNextGarminProbeErrorAt,
  getNextGarminSyncQueuePreview,
  isRecentGarminActivityForReport,
  shouldRunGarminSyncForProbe,
  syncAllGarminUsers,
  syncGarminForUser,
} from "@/modules/garmin/application/garmin-service";
export type { GarminSyncBatchResult } from "@/modules/garmin/application/garmin-service";
