/**
 * Purge de TTL do cache de atividades do Strava (Task 8).
 *
 * Remove as linhas de `StravaActivityCache` cujo `expiresAt` já passou. O cache
 * é uma otimização de curta duração — o `StravaActivityCache` guarda o payload
 * bruto de uma atividade por um TTL conservador (ver Policy Gate,
 * `getProviderPolicy("STRAVA").maxCacheAgeSeconds`, atualmente 7 dias). Passado
 * esse prazo, a linha não deve mais ser reutilizada e é apagada por esta rotina
 * de retenção (Req 17.1, 17.2).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Idempotência (Req 17.5): `deleteMany` remove 0..N linhas e NUNCA lança quando
 * nada casa. Reexecutar o cleanup converge para o mesmo estado (as linhas já
 * removidas simplesmente não existem mais). O relógio é injetável (`now`) para
 * testes determinísticos.
 *
 * Isolamento entre providers (Req 3.6): `StravaActivityCache` é uma tabela
 * EXCLUSIVA do Strava — nenhuma linha de outro provider é tocada.
 *
 * Segurança (Req 20.1/20.2): o log carrega apenas metadados seguros
 * (provider/operation/count) — nunca payloads, tokens ou PII.
 *
 * _Requisitos: 17.1, 17.2, 17.5_
 */

import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";

/** Parâmetros do purge de cache expirado. */
export interface PurgeExpiredActivityCacheInput {
  /** Relógio injetável (default `() => new Date()`), para testes. */
  now?: () => Date;
}

/** Resultado do purge: quantas linhas de cache foram removidas. */
export interface PurgeExpiredActivityCacheResult {
  /** Linhas removidas de `StravaActivityCache` (0 se nada expirou). */
  deletedCacheEntries: number;
}

/**
 * Remove do `StravaActivityCache` as entradas expiradas (`expiresAt < now`).
 * Idempotente e restrito ao provider STRAVA.
 */
export async function purgeExpiredActivityCache(
  input: PurgeExpiredActivityCacheInput = {},
): Promise<PurgeExpiredActivityCacheResult> {
  const now = input.now ? input.now() : new Date();

  const deleted = await prisma.stravaActivityCache.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  logger.info("Strava expired activity cache purged", {
    provider: "STRAVA",
    operation: "retention_cache",
    status: "purged",
    deletedCacheEntries: deleted.count,
  });

  return { deletedCacheEntries: deleted.count };
}
