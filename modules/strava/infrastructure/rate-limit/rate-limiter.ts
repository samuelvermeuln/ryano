/**
 * Núcleo (testável) do rate limiter do Strava (Task 6.3).
 *
 * Modela as DUAS janelas do Strava (15 minutos + diária) para os DOIS buckets
 * (`overall` e `read`/`non-upload`), com semântica de reset idêntica à oficial
 * (parafraseado, conformidade de licenciamento —
 * [Strava Rate Limits](https://developers.strava.com/docs/rate-limits/)):
 *
 * - A janela de 15 min reinicia em múltiplos naturais do relógio
 *   (min 0/15/30/45 da hora), que coincidem com múltiplos de 15 min desde a época
 *   Unix (UTC).
 * - A janela diária reinicia à meia-noite UTC.
 * - Violar o limite curto ainda consome cota do limite longo (por isso ambas as
 *   janelas são incrementadas em cada reserva).
 *
 * A classe é PURA em relação ao tempo: recebe um `now()` injetável, sem I/O e sem
 * segredos. A instância singleton compartilhada vive em `index.ts`.
 *
 * ── Escolha de armazenamento ────────────────────────────────────────────────
 * Estado EM MEMÓRIA por instância. Justificativa: o Strava devolve o uso
 * AUTORITATIVO em cada resposta (headers), então `updateFromHeaders()` re-sincroniza
 * o contador local com a contagem real do Strava após cada chamada. O contador
 * local serve apenas como reserva conservadora ENTRE respostas (evita disparar um
 * lote de requisições antes de o Strava confirmar o uso). Tradeoff: em deploy
 * multi-instância cada processo mantém seu próprio contador, então a reserva local
 * pode subestimar o uso agregado; a auto-correção via headers + o backoff de 429 do
 * client (Task 6) mantêm o sistema dentro do limite. Se for preciso coordenação
 * cross-instância no futuro, troca-se o backing store por `RateLimitBucket`
 * (Prisma) sem alterar a API pública.
 *
 * _Requisitos: 11.7, 18.4_
 */

import type {
  StravaRateLimitBackoff,
  StravaRateLimitBucket,
  StravaRateLimitDecision,
  StravaRateLimitHeaderReport,
  StravaRateLimitLimits,
  StravaRateLimitSnapshot,
  StravaRequestKind,
  StravaWindowSnapshot,
  StravaWindowState,
} from "@/modules/strava/infrastructure/rate-limit/types";

/** Duração da janela curta do Strava (15 minutos) em milissegundos. */
export const STRAVA_SHORT_TERM_WINDOW_MS = 15 * 60 * 1000;
/** Duração da janela diária em milissegundos (usada só como fallback). */
export const STRAVA_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Próximo limite natural de 15 min (min 0/15/30/45), em epoch ms. Alinhado à
 * época Unix, portanto coincide com os limites de relógio UTC do Strava.
 */
export function nextShortTermReset(nowMs: number): number {
  const q = STRAVA_SHORT_TERM_WINDOW_MS;
  return (Math.floor(nowMs / q) + 1) * q;
}

/** Próxima meia-noite UTC, em epoch ms. */
export function nextUtcMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
}

interface BucketState {
  shortTerm: StravaWindowState;
  daily: StravaWindowState;
}

interface LimiterState {
  overall: BucketState;
  read: BucketState;
}

export interface StravaRateLimiterOptions {
  limits: StravaRateLimitLimits;
  /** Relógio injetável (default `Date.now`), para testes determinísticos. */
  now?: () => number;
}

export class StravaRateLimiter {
  private readonly getNow: () => number;
  private state: LimiterState;

  constructor(options: StravaRateLimiterOptions) {
    this.getNow = options.now ?? (() => Date.now());
    this.state = this.buildInitialState(options.limits, this.getNow());
  }

  private buildInitialState(
    limits: StravaRateLimitLimits,
    nowMs: number,
  ): LimiterState {
    const build = (bucket: keyof StravaRateLimitLimits): BucketState => ({
      shortTerm: {
        count: 0,
        limit: limits[bucket].shortTermLimit,
        resetAt: nextShortTermReset(nowMs),
      },
      daily: {
        count: 0,
        limit: limits[bucket].dailyLimit,
        resetAt: nextUtcMidnight(nowMs),
      },
    });

    return { overall: build("overall"), read: build("read") };
  }

  /** Reaplica limites (ex.: config recarregada) preservando os contadores. */
  setLimits(limits: StravaRateLimitLimits): void {
    this.state.overall.shortTerm.limit = limits.overall.shortTermLimit;
    this.state.overall.daily.limit = limits.overall.dailyLimit;
    this.state.read.shortTerm.limit = limits.read.shortTermLimit;
    this.state.read.daily.limit = limits.read.dailyLimit;
  }

  /** Zera contadores e recomputa fronteiras (útil em testes/boot). */
  reset(): void {
    const nowMs = this.getNow();
    for (const bucket of ["overall", "read"] as const) {
      this.rollWindow(this.state[bucket].shortTerm, "shortTerm", nowMs, true);
      this.rollWindow(this.state[bucket].daily, "daily", nowMs, true);
    }
  }

  /**
   * Se a janela expirou (ou `force`), zera o contador e reprograma o `resetAt`
   * para a próxima fronteira natural.
   */
  private rollWindow(
    window: StravaWindowState,
    kind: "shortTerm" | "daily",
    nowMs: number,
    force = false,
  ): void {
    if (force || nowMs >= window.resetAt) {
      window.count = 0;
      window.resetAt =
        kind === "shortTerm" ? nextShortTermReset(nowMs) : nextUtcMidnight(nowMs);
    }
  }

  /** Janelas relevantes para um tipo de requisição. */
  private applicableBuckets(kind: StravaRequestKind): StravaRateLimitBucket[] {
    // Leitura consome overall + read; escrita/upload consome só overall.
    return kind === "read" ? ["overall", "read"] : ["overall"];
  }

  private rollAll(nowMs: number): void {
    for (const bucket of ["overall", "read"] as const) {
      this.rollWindow(this.state[bucket].shortTerm, "shortTerm", nowMs);
      this.rollWindow(this.state[bucket].daily, "daily", nowMs);
    }
  }

  /**
   * Avalia se uma requisição do tipo `kind` caberia AGORA e, em caso positivo,
   * RESERVA o slot (incrementa os contadores). Em caso negativo, não altera o
   * estado e informa quando tentar de novo.
   */
  reserve(kind: StravaRequestKind = "read"): StravaRateLimitDecision {
    const nowMs = this.getNow();
    this.rollAll(nowMs);

    const buckets = this.applicableBuckets(kind);

    let blocking:
      | { retryAfterMs: number; bucket: StravaRateLimitBucket; window: "shortTerm" | "daily" }
      | undefined;

    for (const bucket of buckets) {
      for (const window of ["shortTerm", "daily"] as const) {
        const state = this.state[bucket][window];
        if (state.count >= state.limit) {
          const retryAfterMs = Math.max(0, state.resetAt - nowMs);
          // Escolhe a janela com maior espera: só podemos prosseguir quando a
          // última janela bloqueante reiniciar.
          if (!blocking || retryAfterMs > blocking.retryAfterMs) {
            blocking = { retryAfterMs, bucket, window };
          }
        }
      }
    }

    if (blocking) {
      return { granted: false, ...blocking };
    }

    for (const bucket of buckets) {
      this.state[bucket].shortTerm.count += 1;
      this.state[bucket].daily.count += 1;
    }

    return { granted: true };
  }

  /**
   * Situação de backoff sem reservar. Retorna `blocked: true` quando alguma
   * janela aplicável já atingiu o limite, com o tempo até o reset da janela
   * mais restritiva.
   */
  getBackoff(kind: StravaRequestKind = "read"): StravaRateLimitBackoff {
    const nowMs = this.getNow();
    this.rollAll(nowMs);

    const buckets = this.applicableBuckets(kind);
    let blocking:
      | { retryAfterMs: number; bucket: StravaRateLimitBucket; window: "shortTerm" | "daily" }
      | undefined;

    for (const bucket of buckets) {
      for (const window of ["shortTerm", "daily"] as const) {
        const state = this.state[bucket][window];
        if (state.count >= state.limit) {
          const retryAfterMs = Math.max(0, state.resetAt - nowMs);
          if (!blocking || retryAfterMs > blocking.retryAfterMs) {
            blocking = { retryAfterMs, bucket, window };
          }
        }
      }
    }

    return blocking ? { blocked: true, ...blocking } : { blocked: false };
  }

  /**
   * Sincroniza o estado com o uso/limite AUTORITATIVO reportado pelo Strava nos
   * headers da resposta. Deve ser chamado após CADA resposta (2xx e 429).
   *
   * Para cada janela presente no relatório: rola a janela se expirou, atualiza o
   * limite se informado e ajusta o contador para o MÁXIMO entre o valor local e
   * o uso reportado (conservador — evita subestimar caso o Strava ainda não
   * tenha contabilizado uma requisição local em andamento).
   */
  updateFromHeaders(report: StravaRateLimitHeaderReport): void {
    const nowMs = this.getNow();
    this.rollAll(nowMs);

    for (const bucket of ["overall", "read"] as const) {
      const bucketReport = report[bucket];
      if (!bucketReport) continue;

      const { limit, usage } = bucketReport;
      if (limit) {
        this.state[bucket].shortTerm.limit = limit.shortTerm;
        this.state[bucket].daily.limit = limit.daily;
      }
      if (usage) {
        this.state[bucket].shortTerm.count = Math.max(
          this.state[bucket].shortTerm.count,
          usage.shortTerm,
        );
        this.state[bucket].daily.count = Math.max(
          this.state[bucket].daily.count,
          usage.daily,
        );
      }
    }
  }

  /** Snapshot imutável do estado corrente (após rolar janelas expiradas). */
  snapshot(): StravaRateLimitSnapshot {
    const nowMs = this.getNow();
    this.rollAll(nowMs);

    const toSnapshot = (window: StravaWindowState): StravaWindowSnapshot => ({
      count: window.count,
      limit: window.limit,
      resetAt: window.resetAt,
      remaining: Math.max(0, window.limit - window.count),
    });

    return {
      overall: {
        shortTerm: toSnapshot(this.state.overall.shortTerm),
        daily: toSnapshot(this.state.overall.daily),
      },
      read: {
        shortTerm: toSnapshot(this.state.read.shortTerm),
        daily: toSnapshot(this.state.read.daily),
      },
    };
  }
}
