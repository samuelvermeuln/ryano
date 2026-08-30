/**
 * Tipos do rate limiter por módulo do Strava (Task 6.3).
 *
 * O Strava aplica limites por aplicação em DUAS janelas simultâneas — 15 minutos
 * e diária — e para DOIS buckets distintos:
 *
 * - `overall`: conta TODAS as chamadas à API.
 * - `read` ("non-upload"): conta todas as chamadas EXCETO criação de atividade,
 *   upload e upload de mídia.
 *
 * Fonte (parafraseada, conformidade de licenciamento):
 * [Strava Rate Limits](https://developers.strava.com/docs/rate-limits/).
 *
 * Uma requisição de leitura consome cota em ambos os buckets (`overall` + `read`);
 * uma requisição de escrita/upload consome apenas `overall`. Como o módulo
 * Strava opera somente em leitura, na prática o bucket `read` é o restritivo.
 *
 * _Requisitos: 11.7, 18.4_
 */

/**
 * Tipo de requisição do ponto de vista do rate limit do Strava.
 *
 * - `read`: qualquer endpoint "non-upload" (athlete, listar/detalhar atividades,
 *   streams, laps). Consome `overall` + `read`.
 * - `write`: criação de atividade / upload / upload de mídia. Consome só
 *   `overall`. Incluído para correção do modelo, embora o módulo hoje só leia.
 */
export type StravaRequestKind = "read" | "write";

/** Identifica um dos quatro contadores rastreados. */
export type StravaRateLimitBucket = "overall" | "read";
export type StravaRateLimitWindow = "shortTerm" | "daily";

/** Limites (por janela) de um bucket. */
export interface StravaBucketLimits {
  /** Limite da janela de 15 minutos. */
  shortTermLimit: number;
  /** Limite da janela diária (reinicia à meia-noite UTC). */
  dailyLimit: number;
}

/** Limites completos (overall + read) usados para inicializar o limiter. */
export interface StravaRateLimitLimits {
  overall: StravaBucketLimits;
  read: StravaBucketLimits;
}

/** Estado interno de uma única janela (contador local + limite + reset). */
export interface StravaWindowState {
  /** Uso local acumulado desde o último reset da janela. */
  count: number;
  /** Limite corrente da janela (pode ser atualizado por header do Strava). */
  limit: number;
  /** Instante (epoch ms) em que a janela reinicia. */
  resetAt: number;
}

/** Snapshot imutável do estado de uma janela, exposto para observabilidade. */
export interface StravaWindowSnapshot extends StravaWindowState {
  /** Cota restante estimada (`limit - count`, nunca negativa). */
  remaining: number;
}

/** Snapshot completo do limiter (todas as janelas de todos os buckets). */
export interface StravaRateLimitSnapshot {
  overall: {
    shortTerm: StravaWindowSnapshot;
    daily: StravaWindowSnapshot;
  };
  read: {
    shortTerm: StravaWindowSnapshot;
    daily: StravaWindowSnapshot;
  };
}

/**
 * Par `usado,limite` de uma janela, como o Strava reporta nos headers
 * (`X-RateLimit-*` e `X-ReadRateLimit-*` vêm como "15min,diário").
 */
export interface StravaRateLimitHeaderPair {
  shortTerm: number;
  daily: number;
}

/** Uso + limites autoritativos parseados dos headers de uma resposta Strava. */
export interface StravaRateLimitHeaderReport {
  overall?: {
    usage?: StravaRateLimitHeaderPair;
    limit?: StravaRateLimitHeaderPair;
  };
  read?: {
    usage?: StravaRateLimitHeaderPair;
    limit?: StravaRateLimitHeaderPair;
  };
}

/**
 * Resultado de uma tentativa de reserva de slot.
 *
 * - `granted: true`: a requisição pode prosseguir (contadores já incrementados).
 * - `granted: false`: alguma janela estouraria; `retryAfterMs` indica quando a
 *   janela mais restritiva reinicia; `bucket`/`window` identificam qual estourou.
 */
export type StravaRateLimitDecision =
  | { granted: true }
  | {
      granted: false;
      retryAfterMs: number;
      bucket: StravaRateLimitBucket;
      window: StravaRateLimitWindow;
    };

/**
 * Situação de backoff atual (sem reservar). Usado em conjunto com o backoff de
 * 429 do client (Task 6): se `blocked` for `true`, o chamador deve aguardar
 * `retryAfterMs` antes de tentar a próxima requisição.
 */
export type StravaRateLimitBackoff =
  | { blocked: false }
  | {
      blocked: true;
      retryAfterMs: number;
      bucket: StravaRateLimitBucket;
      window: StravaRateLimitWindow;
    };
