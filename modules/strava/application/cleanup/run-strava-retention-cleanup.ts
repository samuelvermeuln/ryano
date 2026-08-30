/**
 * Agregador de retenção/cleanup do Strava (Task 8).
 *
 * Executa, numa única passada, TODAS as rotinas de purge por TTL do Strava e
 * devolve as contagens consolidadas. É o ponto de entrada acionado pelo job de
 * retenção (Task 8.1, rota `app/api/integrations/strava/jobs/route.ts`).
 *
 * Rotinas orquestradas (todas escopadas ao provider STRAVA — Req 3.6):
 *   - `purgeExpiredActivityCache`: cache de atividades expirado.
 *   - `purgeExpiredStreams`: cache de streams expirado (no-op documentado
 *     enquanto a tabela não existir — ver o arquivo correspondente).
 *   - `purgeExpiredWebhookPayloads`: eventos de webhook transitórios expirados.
 *
 * As rotinas de purge acionadas por EVENTO (`purgeDeletedActivityData` e
 * `purgeDeauthorizedUserData`, Task 7.3) NÃO entram aqui — elas são disparadas
 * pelo processor de webhook em resposta a `activity/delete` e à desautorização,
 * não por TTL. Ficam expostas pelo barrel para quem precise chamá-las direto.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Isolamento de falhas (Req 18.2): cada purge roda dentro do seu próprio
 * `try/catch`. Se um deles falhar, os demais AINDA rodam — o cleanup de cache
 * não é abortado por uma falha no cleanup de webhooks (ou vice-versa). Os erros
 * são registrados e refletidos em `errors[]`, mas o agregador NUNCA lança: o job
 * de retenção deve ser resiliente.
 *
 * Idempotência (Req 17.5): herdada das rotinas subjacentes (todas usam
 * `deleteMany`). O relógio (`now`) é injetável e propagado a todas, para testes
 * determinísticos.
 *
 * Segurança (Req 20.1/20.2): logs só com metadados seguros (contagens) — nunca
 * payloads, tokens ou PII.
 *
 * _Requisitos: 17.1, 17.2, 17.5, 18.2_
 */

import { logger } from "@/server/logging/logger";

import { purgeExpiredActivityCache } from "@/modules/strava/application/cleanup/purge-expired-activity-cache";
import { purgeExpiredStreams } from "@/modules/strava/application/cleanup/purge-expired-streams";
import { purgeExpiredWebhookPayloads } from "@/modules/strava/application/cleanup/purge-expired-webhook-payloads";

/** Parâmetros do agregador de retenção. */
export interface RunStravaRetentionCleanupInput {
  /** Relógio injetável (default `() => new Date()`), propagado a cada purge. */
  now?: () => Date;
}

/** Resultado consolidado da retenção: contagens por rotina + erros isolados. */
export interface RunStravaRetentionCleanupResult {
  /** Linhas removidas de `StravaActivityCache`. */
  deletedCacheEntries: number;
  /** Linhas removidas do cache de streams (0 enquanto a tabela não existir). */
  deletedStreamEntries: number;
  /** Linhas removidas de `StravaWebhookEvent`. */
  deletedWebhookEvents: number;
  /**
   * Códigos das rotinas que falharam (isoladas). Vazio no caminho feliz. A
   * presença aqui NÃO interrompe as demais rotinas (Req 18.2).
   */
  errors: string[];
}

/**
 * Executa todas as rotinas de retenção do Strava, isolando falhas entre elas.
 * Nunca lança: erros são capturados, logados e agregados em `errors[]`.
 */
export async function runStravaRetentionCleanup(
  input: RunStravaRetentionCleanupInput = {},
): Promise<RunStravaRetentionCleanupResult> {
  const now = input.now;

  const result: RunStravaRetentionCleanupResult = {
    deletedCacheEntries: 0,
    deletedStreamEntries: 0,
    deletedWebhookEvents: 0,
    errors: [],
  };

  // Cada purge é isolado: uma falha não impede os demais (Req 18.2).
  try {
    const cache = await purgeExpiredActivityCache({ now });
    result.deletedCacheEntries = cache.deletedCacheEntries;
  } catch (error) {
    result.errors.push("purgeExpiredActivityCache");
    logger.error("Strava retention step failed", {
      provider: "STRAVA",
      operation: "retention",
      status: "step_failed",
      step: "purgeExpiredActivityCache",
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
  }

  try {
    const streams = await purgeExpiredStreams({ now });
    result.deletedStreamEntries = streams.deletedStreamEntries;
  } catch (error) {
    result.errors.push("purgeExpiredStreams");
    logger.error("Strava retention step failed", {
      provider: "STRAVA",
      operation: "retention",
      status: "step_failed",
      step: "purgeExpiredStreams",
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
  }

  try {
    const webhooks = await purgeExpiredWebhookPayloads({ now });
    result.deletedWebhookEvents = webhooks.deletedWebhookEvents;
  } catch (error) {
    result.errors.push("purgeExpiredWebhookPayloads");
    logger.error("Strava retention step failed", {
      provider: "STRAVA",
      operation: "retention",
      status: "step_failed",
      step: "purgeExpiredWebhookPayloads",
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
  }

  logger.info("Strava retention cleanup completed", {
    provider: "STRAVA",
    operation: "retention",
    status: result.errors.length === 0 ? "done" : "done_with_errors",
    deletedCacheEntries: result.deletedCacheEntries,
    deletedStreamEntries: result.deletedStreamEntries,
    deletedWebhookEvents: result.deletedWebhookEvents,
    errorCount: result.errors.length,
  });

  return result;
}
