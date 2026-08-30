/**
 * Batch de sincronização incremental do Strava (Task 8.1).
 *
 * Itera as conexões STRAVA CONECTADAS e chama `syncStravaForUser(userId,
 * { mode: "incremental" })` para cada uma, acionável por job (rota
 * `app/api/integrations/strava/jobs/route.ts`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Isolamento por usuário (Req 18.2): CADA usuário é sincronizado dentro do seu
 * próprio `try/catch`. Uma falha em um usuário — exceção inesperada OU
 * `syncStravaForUser` retornando `status: "failed"` — NÃO interrompe os demais:
 * o loop registra o desfecho e segue. O batch NUNCA lança; devolve o resumo.
 *
 * Rate limit / educação (Req 18.4/11.7): a polidez com a API é responsabilidade
 * do limiter por módulo (o `StravaClient` reserva cota antes de cada request e
 * respeita os headers) somada ao isolamento por usuário. Quando um usuário bate
 * o limite, `syncStravaForUser` retorna `status: "rate-limited"` (sem derrubar o
 * processo) e o batch simplesmente contabiliza e passa ao próximo — o job pode
 * retomar na próxima execução.
 *
 * Escopo (Req 3.6): a query filtra `provider=STRAVA` + `status=CONNECTED`.
 * Nenhuma conexão de outro provider é tocada.
 *
 * Observabilidade (Req 20.3/20.4): logs estruturados com provider/operation/
 * status/contagens; jamais tokens/secrets/PII.
 *
 * _Requisitos: 18.1, 18.2, 18.4, 11.6_
 */

import { WearableProvider } from "@prisma/client";

import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";

import {
  syncStravaForUser,
  type StravaSyncStatus,
} from "@/modules/strava/application/sync/sync-strava";

/** Parâmetros do batch de sync do Strava. */
export interface SyncAllStravaUsersInput {
  /**
   * Teto de usuários processados por execução (proteção). Sem limite explícito,
   * processa todas as conexões conectadas.
   */
  maxUsersPerRun?: number;
}

/** Desfecho da sincronização de um único usuário no batch. */
export interface SyncStravaUserOutcome {
  userId: string;
  connectionId: string;
  /** Status devolvido por `syncStravaForUser`, ou `"failed"` numa exceção. */
  status: StravaSyncStatus;
  /** Atividades processadas (criadas + atualizadas) para este usuário. */
  syncedCount: number;
  /** `code` do erro quando a sync deste usuário falhou. */
  errorCode?: string;
}

/** Resumo consolidado do batch de sync do Strava. */
export interface SyncAllStravaUsersResult {
  /** Total de conexões STRAVA conectadas consideradas nesta execução. */
  totalConnections: number;
  /** Usuários sincronizados com sucesso (`status === "synced"`). */
  succeeded: number;
  /** Usuários que falharam (`status === "failed"` ou exceção). */
  failed: number;
  /** Usuários pausados por rate limit (`status === "rate-limited"`). */
  rateLimited: number;
  /** Soma de atividades processadas em todos os usuários. */
  syncedActivities: number;
  /** Desfecho por usuário (ordem de processamento). */
  results: SyncStravaUserOutcome[];
}

/**
 * Sincroniza (incremental) TODAS as conexões STRAVA conectadas, isolando falhas
 * por usuário. Acionável por job. Nunca lança.
 */
export async function syncAllStravaUsers(
  input: SyncAllStravaUsersInput = {},
): Promise<SyncAllStravaUsersResult> {
  const connections = await prisma.wearableConnection.findMany({
    where: {
      provider: WearableProvider.STRAVA,
      status: "CONNECTED",
    },
    select: { id: true, userId: true },
    ...(typeof input.maxUsersPerRun === "number"
      ? { take: Math.max(1, input.maxUsersPerRun) }
      : {}),
  });

  const result: SyncAllStravaUsersResult = {
    totalConnections: connections.length,
    succeeded: 0,
    failed: 0,
    rateLimited: 0,
    syncedActivities: 0,
    results: [],
  };

  logger.info("Strava batch sync started", {
    provider: "STRAVA",
    operation: "sync_batch",
    status: "started",
    totalConnections: connections.length,
  });

  for (const connection of connections) {
    // Isolamento por usuário (Req 18.2): uma falha aqui não aborta o loop.
    try {
      const syncResult = await syncStravaForUser(connection.userId, {
        mode: "incremental",
      });

      result.syncedActivities += syncResult.syncedCount;

      if (syncResult.status === "synced") {
        result.succeeded += 1;
      } else if (syncResult.status === "rate-limited") {
        result.rateLimited += 1;
      } else if (syncResult.status === "failed") {
        result.failed += 1;
      }

      result.results.push({
        userId: connection.userId,
        connectionId: connection.id,
        status: syncResult.status,
        syncedCount: syncResult.syncedCount,
        errorCode: syncResult.errorCode,
      });
    } catch (error) {
      // Defesa em profundidade: `syncStravaForUser` já captura seus erros, mas
      // qualquer exceção inesperada aqui é isolada para não derrubar o batch.
      const errorCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "STRAVA_BATCH_SYNC_FAILED";

      result.failed += 1;
      result.results.push({
        userId: connection.userId,
        connectionId: connection.id,
        status: "failed",
        syncedCount: 0,
        errorCode,
      });

      logger.error("Strava batch sync: user sync threw", {
        provider: "STRAVA",
        operation: "sync_batch",
        status: "user_failed",
        connectionId: connection.id,
        errorCode,
      });
    }
  }

  logger.info("Strava batch sync completed", {
    provider: "STRAVA",
    operation: "sync_batch",
    status: "done",
    totalConnections: result.totalConnections,
    succeeded: result.succeeded,
    failed: result.failed,
    rateLimited: result.rateLimited,
    syncedActivities: result.syncedActivities,
  });

  return result;
}
