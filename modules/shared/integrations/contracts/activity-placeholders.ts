/**
 * Tipos de atividade/bem-estar usados pelos contratos de provider.
 *
 * A partir da tarefa 1.5, o contrato canônico de atividade
 * (`NormalizedActivity`, `ActivitySource`, `ProviderMetric<T>`) vive em
 * `modules/shared/activities/contracts/`. Este arquivo apenas **re-exporta** a
 * versão canônica (para que consumidores dos contratos de provider continuem
 * importando de um único ponto) e mantém localmente os tipos que são específicos
 * do core de integrações e ainda não têm lar próprio:
 *
 *  - `DailyWellnessSnapshot`: snapshot diário de bem-estar (recovery/sleep/hrv/
 *    readiness). Mantido no core de integrações por ser específico de wellness e
 *    consumido pelo dashboard adaptativo (Fase 4) via registry.
 *  - `ListActivitiesInput`: filtros provider-agnostic de `listActivities`.
 */

import type { ProviderId } from "@/modules/shared/integrations/types";

// Re-exporta o contrato canônico de atividade definido em 1.5. `sportType` é
// agora `RyvanoSportType` (taxonomia canônica), não mais `string`.
export type {
  ActivitySource,
  NormalizedActivity,
  ProviderMetric,
} from "@/modules/shared/activities/contracts";

/**
 * Snapshot diário de bem-estar (recovery/sleep/hrv/readiness) exposto por
 * providers que declaram a capability `dailyWellness`. Estrutura mínima e
 * aberta; será refinada quando o dashboard adaptativo (Fase 4) consumir estes
 * dados via registry.
 */
export type DailyWellnessSnapshot = {
  /** Provider de origem do snapshot. */
  source: ProviderId;
  /** Data de referência (YYYY-MM-DD). */
  date: string;
  bodyBattery?: number;
  hrv?: number;
  sleepScore?: number;
  readiness?: number;
  /** Payload cru específico do provider. */
  raw?: Record<string, unknown>;
};

/**
 * Parâmetros de listagem de atividades aceitos por um `ActivityProvider`.
 *
 * Definido aqui (contratos do core) por ser provider-agnostic e usado pela
 * assinatura de `listActivities`. Cada módulo traduz estes filtros para os
 * parâmetros da sua API.
 */
export type ListActivitiesInput = {
  /** Somente atividades iniciadas a partir deste instante (inclusive). */
  since?: Date;
  /** Somente atividades iniciadas até este instante (inclusive). */
  until?: Date;
  /** Número máximo de atividades a retornar. */
  limit?: number;
  /** Página (paginação), quando o provider suportar. */
  page?: number;
};
