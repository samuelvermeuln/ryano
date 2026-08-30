/**
 * Parser PURO dos headers de rate limit do Strava (Task 6.3).
 *
 * O Strava anexa a TODA resposta da API (200 e 429) os headers abaixo, cada um
 * com dois inteiros separados por vírgula na ordem "15 minutos,diário"
 * (parafraseado da doc oficial, conformidade de licenciamento —
 * [Strava Rate Limits](https://developers.strava.com/docs/rate-limits/)):
 *
 * - `X-RateLimit-Limit`      → limite overall  (15min, diário)
 * - `X-RateLimit-Usage`      → uso overall      (15min, diário)
 * - `X-ReadRateLimit-Limit`  → limite read      (15min, diário)
 * - `X-ReadRateLimit-Usage`  → uso read         (15min, diário)
 *
 * Esses valores são AUTORITATIVOS: refletem a contagem do próprio Strava e devem
 * sincronizar o estado local (ver `rate-limiter.ts`). Nomes de header são
 * tratados de forma case-insensitive; entradas ausentes/malformadas são
 * ignoradas (retornam `undefined`) para nunca quebrar o fluxo do client.
 *
 * _Requisitos: 11.7, 18.4_
 */

import type {
  StravaRateLimitHeaderPair,
  StravaRateLimitHeaderReport,
} from "@/modules/strava/infrastructure/rate-limit/types";

/**
 * Fonte de headers aceita: um `Headers` (fetch) ou um objeto simples de
 * chave→valor. Chaves são resolvidas sem diferenciar maiúsculas/minúsculas.
 */
export type StravaHeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>;

function readHeader(source: StravaHeaderSource, name: string): string | undefined {
  if (typeof Headers !== "undefined" && source instanceof Headers) {
    return source.get(name) ?? undefined;
  }

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(
    source as Record<string, string | string[] | undefined>,
  )) {
    if (key.toLowerCase() === lowerName) {
      if (Array.isArray(value)) {
        return value[0];
      }
      return value ?? undefined;
    }
  }

  return undefined;
}

/**
 * Converte um header "a,b" em `{ shortTerm: a, daily: b }`. Retorna `undefined`
 * quando ausente ou fora do formato esperado (dois inteiros não-negativos).
 */
export function parseStravaRateLimitPair(
  raw: string | undefined,
): StravaRateLimitHeaderPair | undefined {
  if (!raw) {
    return undefined;
  }

  const parts = raw.split(",").map((part) => part.trim());
  if (parts.length !== 2) {
    return undefined;
  }

  const shortTerm = Number(parts[0]);
  const daily = Number(parts[1]);

  if (
    !Number.isFinite(shortTerm) ||
    !Number.isFinite(daily) ||
    shortTerm < 0 ||
    daily < 0
  ) {
    return undefined;
  }

  return { shortTerm: Math.floor(shortTerm), daily: Math.floor(daily) };
}

/**
 * Extrai o relatório estruturado de uso/limites a partir dos headers de uma
 * resposta Strava. Buckets sem nenhum dado válido são omitidos.
 */
export function parseStravaRateLimitHeaders(
  source: StravaHeaderSource,
): StravaRateLimitHeaderReport {
  const report: StravaRateLimitHeaderReport = {};

  const overallLimit = parseStravaRateLimitPair(
    readHeader(source, "X-RateLimit-Limit"),
  );
  const overallUsage = parseStravaRateLimitPair(
    readHeader(source, "X-RateLimit-Usage"),
  );
  if (overallLimit || overallUsage) {
    report.overall = {};
    if (overallUsage) report.overall.usage = overallUsage;
    if (overallLimit) report.overall.limit = overallLimit;
  }

  const readLimit = parseStravaRateLimitPair(
    readHeader(source, "X-ReadRateLimit-Limit"),
  );
  const readUsage = parseStravaRateLimitPair(
    readHeader(source, "X-ReadRateLimit-Usage"),
  );
  if (readLimit || readUsage) {
    report.read = {};
    if (readUsage) report.read.usage = readUsage;
    if (readLimit) report.read.limit = readLimit;
  }

  return report;
}
