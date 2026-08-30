/**
 * Superfície pública do rate limiter por módulo do Strava (Task 6.3).
 *
 * Fornece um singleton por instância do processo, configurado a partir de
 * `getStravaRateLimits()` (defaults oficiais + overrides de ENV), e a API pequena
 * consumida pelo `StravaClient` (Task 6) e pelo sync (Task 6.4):
 *
 * - `acquireStravaRequestSlot(kind)` / `assertStravaRateLimit(kind)`: checam e
 *   RESERVAM cota ANTES de uma requisição; `assert` lança `StravaRateLimitError`
 *   quando estouraria.
 * - `updateStravaRateLimitFromHeaders(headers)`: sincroniza o estado com o uso
 *   autoritativo que o Strava devolve em cada resposta. Chamar após CADA resposta.
 * - `getStravaRateLimitBackoff(kind)`: informa quando recuar (combina com o
 *   backoff de 429 do client).
 * - `getStravaRateLimitSnapshot()`: leitura de observabilidade (sem segredos).
 *
 * Os limites são POR PROVIDER (sem número global único), atendendo ao Req 11.7 e
 * mantendo os jobs de cada provider independentes (Req 18.4).
 *
 * _Requisitos: 11.7, 18.4_
 */

import { getStravaRateLimits } from "@/modules/strava/config";
import { logger } from "@/server/logging/logger";

import {
  parseStravaRateLimitHeaders,
  type StravaHeaderSource,
} from "@/modules/strava/infrastructure/rate-limit/parse-rate-limit-headers";
import { StravaRateLimiter } from "@/modules/strava/infrastructure/rate-limit/rate-limiter";
import type {
  StravaRateLimitBackoff,
  StravaRateLimitBucket,
  StravaRateLimitDecision,
  StravaRateLimitSnapshot,
  StravaRateLimitWindow,
  StravaRequestKind,
} from "@/modules/strava/infrastructure/rate-limit/types";

export {
  parseStravaRateLimitHeaders,
  parseStravaRateLimitPair,
} from "@/modules/strava/infrastructure/rate-limit/parse-rate-limit-headers";
export type { StravaHeaderSource } from "@/modules/strava/infrastructure/rate-limit/parse-rate-limit-headers";
export {
  nextShortTermReset,
  nextUtcMidnight,
  StravaRateLimiter,
  STRAVA_DAILY_WINDOW_MS,
  STRAVA_SHORT_TERM_WINDOW_MS,
} from "@/modules/strava/infrastructure/rate-limit/rate-limiter";
export type {
  StravaBucketLimits,
  StravaRateLimitBackoff,
  StravaRateLimitBucket,
  StravaRateLimitDecision,
  StravaRateLimitHeaderPair,
  StravaRateLimitHeaderReport,
  StravaRateLimitLimits,
  StravaRateLimitSnapshot,
  StravaRateLimitWindow,
  StravaRequestKind,
  StravaWindowSnapshot,
} from "@/modules/strava/infrastructure/rate-limit/types";

/**
 * Erro lançado por `assertStravaRateLimit` quando uma requisição estouraria o
 * limite do Strava. Carrega o bucket/janela que bloqueou e quanto esperar (ms)
 * até o reset, para o client agendar o retry sem chamar o Strava à toa.
 */
export class StravaRateLimitError extends Error {
  readonly retryAfterMs: number;
  readonly bucket: StravaRateLimitBucket;
  readonly window: StravaRateLimitWindow;

  constructor(params: {
    retryAfterMs: number;
    bucket: StravaRateLimitBucket;
    window: StravaRateLimitWindow;
  }) {
    super(
      `Strava rate limit reached (${params.bucket}/${params.window}); retry in ${params.retryAfterMs}ms`,
    );
    this.name = "StravaRateLimitError";
    this.retryAfterMs = params.retryAfterMs;
    this.bucket = params.bucket;
    this.window = params.window;
  }
}

let limiterSingleton: StravaRateLimiter | null = null;

/** Retorna (criando na primeira chamada) o limiter singleton do processo. */
export function getStravaRateLimiter(): StravaRateLimiter {
  if (!limiterSingleton) {
    limiterSingleton = new StravaRateLimiter({ limits: getStravaRateLimits() });
  }
  return limiterSingleton;
}

/**
 * Reseta o singleton (recria com os limites correntes de config). Destinado a
 * testes e a cenários de reconfiguração.
 */
export function resetStravaRateLimiter(): void {
  limiterSingleton = null;
}

/**
 * Verifica e RESERVA cota para uma requisição antes de enviá-la. Retorna a
 * decisão (concedida ou bloqueada com `retryAfterMs`). Não lança.
 */
export function acquireStravaRequestSlot(
  kind: StravaRequestKind = "read",
): StravaRateLimitDecision {
  return getStravaRateLimiter().reserve(kind);
}

/**
 * Igual a `acquireStravaRequestSlot`, mas LANÇA `StravaRateLimitError` quando a
 * requisição estouraria o limite (contadores não são alterados nesse caso).
 */
export function assertStravaRateLimit(kind: StravaRequestKind = "read"): void {
  const decision = getStravaRateLimiter().reserve(kind);
  if (!decision.granted) {
    logger.warn("Strava request throttled by local rate limiter", {
      provider: "STRAVA",
      operation: "rate_limit",
      bucket: decision.bucket,
      window: decision.window,
      retryAfterMs: decision.retryAfterMs,
    });
    throw new StravaRateLimitError({
      retryAfterMs: decision.retryAfterMs,
      bucket: decision.bucket,
      window: decision.window,
    });
  }
}

/**
 * Sincroniza o limiter com os headers de rate limit AUTORITATIVOS de uma
 * resposta Strava. Aceita `Headers` (fetch) ou um objeto de chave→valor.
 */
export function updateStravaRateLimitFromHeaders(headers: StravaHeaderSource): void {
  const report = parseStravaRateLimitHeaders(headers);
  getStravaRateLimiter().updateFromHeaders(report);
}

/** Situação de backoff atual (sem reservar cota). */
export function getStravaRateLimitBackoff(
  kind: StravaRequestKind = "read",
): StravaRateLimitBackoff {
  return getStravaRateLimiter().getBackoff(kind);
}

/** Snapshot de observabilidade do estado do limiter (sem segredos). */
export function getStravaRateLimitSnapshot(): StravaRateLimitSnapshot {
  return getStravaRateLimiter().snapshot();
}
