/**
 * Barrel da camada de OBSERVABILIDADE das integrações esportivas (Task 9.3).
 *
 * Reúne dois recursos leves e provider-agnostic:
 *   - `logIntegrationEvent`: logging estruturado com campos padronizados
 *     (provider/operation/status/connectionId/httpStatus) e rede de segurança
 *     que omite chaves sensíveis (Req 20.1, 20.2, 20.3).
 *   - Métricas rotuladas por provider (`incrementIntegrationMetric` +
 *     `getIntegrationMetricsSnapshot`/`resetIntegrationMetrics`), in-process e
 *     sem dependências pesadas (Req 20.4).
 *
 * _Requisitos: 20.1, 20.2, 20.3, 20.4_
 */

export {
  logIntegrationEvent,
  __stripSensitiveForTests,
} from "@/modules/shared/integrations/observability/log";
export type {
  IntegrationLogLevel,
  IntegrationLogFields,
} from "@/modules/shared/integrations/observability/log";

export {
  incrementIntegrationMetric,
  getIntegrationMetricsSnapshot,
  getIntegrationMetric,
  resetIntegrationMetrics,
} from "@/modules/shared/integrations/observability/metrics";
export type {
  IntegrationMetricName,
  IncrementIntegrationMetricInput,
  IntegrationMetricSnapshotEntry,
} from "@/modules/shared/integrations/observability/metrics";
