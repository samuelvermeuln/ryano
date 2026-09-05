/**
 * Sync e backfill inicial de atividades do Strava (Task 6.4).
 *
 * Ponto de entrada: `syncStravaForUser(userId, { mode? })`. Resolve a conexão
 * STRAVA do usuário, pagina as atividades via `StravaClient.listAthleteActivities`
 * (Task 6), normaliza cada atividade com `parseStravaActivity` (Task 6.2) e faz
 * o UPSERT idempotente na `Activity`, chaveado pelo unique
 * `(provider, externalId, userId)` — reexecutar NÃO duplica (Req 11.6).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Política de dados (Req 15.3): ANTES de persistir qualquer atividade, o sync
 * chama `assertPolicy("STRAVA", "persist")`. A política do Strava permite
 * `persist=true` (a atividade importada precisa ser gravada), então a chamada
 * passa — mas ela existe ARQUITETURALMENTE, de modo que qualquer mudança futura
 * de política bloqueia a persistência sem depender de convenção.
 *
 * Este sync NÃO combina/reconcilia dados entre providers (isso é a Task 9.1,
 * gated por flag + `assertPolicy(..., "combine")`). Ele apenas persiste as
 * atividades do próprio Strava (Req 16.2).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Backfill x incremental (confirmado na doc oficial vigente do Strava —
 * `GET /athlete/activities` aceita `after`/`before` em epoch de SEGUNDOS e
 * pagina com `page`/`per_page`, fim sinalizado por página vazia; parafraseado
 * para conformidade de licenciamento):
 *
 * - `initial-backfill`: primeira conexão. Importa os últimos
 *   `STRAVA_INITIAL_BACKFILL_DAYS` (config, default 30) dias, usando
 *   `after = now - backfillDays` e paginando até esgotar.
 * - `incremental`: sincronizações seguintes. Usa uma janela a partir do último
 *   sucesso (`lastSuccessAt`/`lastSyncAt`) com uma pequena sobreposição para
 *   capturar edições recentes; nunca antes da janela de backfill.
 * - `auto` (default): escolhe `initial-backfill` se a conexão nunca sincronizou,
 *   senão `incremental`.
 *
 * Rate limit (Req 18.1/11.7): o paginador respeita o limiter do módulo (o client
 * reserva cota antes de cada request e sincroniza pelos headers). Se o limite for
 * atingido (local `StravaRateLimitError` ou remoto `StravaRateLimitExceededError`),
 * o sync PARA educadamente, persiste o que já obteve e retorna
 * `status: "rate-limited"` com `retryAfterMs`, sem derrubar o processo — o job
 * pode retomar depois.
 *
 * Observabilidade (Req 20.3/20.4): logs estruturados com provider/operation/
 * status/connectionId; jamais tokens/secrets/PII.
 *
 * _Requisitos: 11.6, 15.3, 16.2, 18.1_
 */

import { WearableProvider } from "@prisma/client";

import { assertPolicy } from "@/modules/shared/integrations/policy";
import {
  createStravaClient,
  StravaClient,
  StravaRateLimitError,
  StravaRateLimitExceededError,
} from "@/modules/strava/api/client";
import { getStravaInitialBackfillDays } from "@/modules/strava/config";
import { normalizedStravaActivityToActivityData } from "@/modules/strava/database/mappers/normalized-activity-to-activity";
import { parseStravaActivity } from "@/modules/strava/parsers/parse-strava-activity";
import {
  cacheStravaActivityLaps,
  needsStravaActivityLapBackfill,
  preserveStravaActivityLapCache,
} from "@/modules/strava/application/activities/strava-activity-laps-cache";
import { incrementIntegrationMetric } from "@/modules/shared/integrations/observability";
import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";

/** Segundos por dia (janela de backfill). */
const SECONDS_PER_DAY = 24 * 60 * 60;

/** Itens por página no backfill (máximo permitido pelo Strava). */
const DEFAULT_SYNC_PAGE_SIZE = 200;

/**
 * Teto de páginas por execução (proteção). 200 itens/página → até 10.000
 * atividades por sync, suficiente para o backfill e evitando loop infinito caso
 * o Strava nunca devolva uma página vazia.
 */
const DEFAULT_MAX_PAGES = 50;

/**
 * Sobreposição (segundos) aplicada ao sync incremental para recapturar
 * atividades editadas logo após o último sucesso. 1 dia é conservador e barato
 * (o upsert é idempotente).
 */
const INCREMENTAL_OVERLAP_SECONDS = SECONDS_PER_DAY;

/** Modo de sincronização. */
export type StravaSyncMode = "initial-backfill" | "incremental" | "auto";

/** Parâmetros de `syncStravaForUser`. */
export interface SyncStravaForUserInput {
  /** Modo desejado (default `"auto"`). */
  mode?: StravaSyncMode;
  /** Client injetável (default: `createStravaClient()`), para testes. */
  client?: StravaClient;
  /** Relógio injetável (default `Date.now`), para testes determinísticos. */
  now?: () => number;
  /** Override dos dias de backfill (default: config). */
  backfillDays?: number;
  /** Itens por página (default 200, teto do Strava). */
  perPage?: number;
  /** Teto de páginas por execução (default {@link DEFAULT_MAX_PAGES}). */
  maxPages?: number;
}

/** Status final do sync. */
export type StravaSyncStatus =
  | "no-connection"
  | "synced"
  | "rate-limited"
  | "failed";

/** Resultado de `syncStravaForUser`. */
export interface SyncStravaResult {
  status: StravaSyncStatus;
  /** Conexão sincronizada (ausente quando `no-connection`). */
  connectionId?: string;
  /** Modo efetivamente executado (após resolver `auto`). */
  mode?: Exclude<StravaSyncMode, "auto">;
  /** Total de atividades processadas (criadas + atualizadas). */
  syncedCount: number;
  /** Atividades novas criadas nesta execução. */
  createdCount: number;
  /** `retryAfterMs` quando `status === "rate-limited"`. */
  retryAfterMs?: number;
  /** `code` do erro quando `status === "failed"`. */
  errorCode?: string;
}

/** Resolve a conexão STRAVA (CONNECTED ou não) do usuário. */
async function resolveStravaConnection(userId: string) {
  return prisma.wearableConnection.findUnique({
    where: {
      userId_provider: { userId, provider: WearableProvider.STRAVA },
    },
    select: { id: true, userId: true, status: true, lastSyncAt: true, lastSuccessAt: true },
  });
}

/** Resolve o modo efetivo a partir do modo pedido + estado da conexão. */
function resolveMode(
  requested: StravaSyncMode,
  connection: { lastSyncAt: Date | null },
): Exclude<StravaSyncMode, "auto"> {
  if (requested === "initial-backfill" || requested === "incremental") {
    return requested;
  }
  return connection.lastSyncAt ? "incremental" : "initial-backfill";
}

/**
 * Calcula o `after` (epoch em segundos) da janela a importar, conforme o modo.
 */
function computeAfterEpochSeconds(
  mode: Exclude<StravaSyncMode, "auto">,
  connection: { lastSuccessAt: Date | null; lastSyncAt: Date | null },
  nowMs: number,
  backfillDays: number,
): number {
  const backfillAfter = Math.floor(nowMs / 1000) - backfillDays * SECONDS_PER_DAY;

  if (mode === "initial-backfill") {
    return backfillAfter;
  }

  const anchor = connection.lastSuccessAt ?? connection.lastSyncAt;
  if (!anchor) {
    return backfillAfter;
  }

  const incrementalAfter =
    Math.floor(anchor.getTime() / 1000) - INCREMENTAL_OVERLAP_SECONDS;

  // Nunca vai além da janela de backfill (evita reimportar histórico antigo).
  return Math.max(incrementalAfter, backfillAfter);
}

/**
 * Persiste uma atividade normalizada do Strava idempotentemente. Retorna `true`
 * quando criou uma atividade nova, `false` quando atualizou uma existente.
 */
async function upsertStravaActivity(
  userId: string,
  connectionId: string,
  activityData: ReturnType<typeof normalizedStravaActivityToActivityData>,
): Promise<{ created: boolean; activity: Awaited<ReturnType<typeof prisma.activity.upsert>>; cacheWasMissing: boolean }> {
  const existing = await prisma.activity.findUnique({
    where: {
      provider_externalId_userId: {
        provider: WearableProvider.STRAVA,
        externalId: activityData.externalId,
        userId,
      },
    },
    select: { id: true, metrics: true },
  });

  const activity = await prisma.activity.upsert({
    where: {
      provider_externalId_userId: {
        provider: WearableProvider.STRAVA,
        externalId: activityData.externalId,
        userId,
      },
    },
    update: {
      ...activityData,
      metrics: preserveStravaActivityLapCache(activityData.metrics, existing?.metrics) as unknown as import("@prisma/client").Prisma.InputJsonValue,
      wearableConnectionId: connectionId,
      userId,
    },
    create: { ...activityData, wearableConnectionId: connectionId, userId },
  });

  return { created: existing === null, activity, cacheWasMissing: needsStravaActivityLapBackfill(existing?.metrics) };
}

/**
 * Sincroniza (backfill inicial ou incremental) as atividades do Strava de um
 * usuário. Idempotente e tolerante à ausência de conexão.
 *
 * @returns o resumo da execução (nunca lança para "sem conexão" ou rate limit;
 *   erros inesperados são capturados e retornados como `status: "failed"`).
 */
export async function syncStravaForUser(
  userId: string,
  input: SyncStravaForUserInput = {},
): Promise<SyncStravaResult> {
  if (!userId || userId.trim() === "") {
    return { status: "no-connection", syncedCount: 0, createdCount: 0 };
  }

  const connection = await resolveStravaConnection(userId);

  if (!connection) {
    // Sem conexão Strava: nada a fazer (Req: tratar graciosamente).
    logger.info("Strava sync skipped: no connection for user", {
      provider: "STRAVA",
      operation: "sync",
      status: "no_connection",
      userId,
    });
    return { status: "no-connection", syncedCount: 0, createdCount: 0 };
  }

  const now = input.now ?? Date.now;
  const backfillDays = input.backfillDays ?? getStravaInitialBackfillDays();
  const perPage = Math.min(
    DEFAULT_SYNC_PAGE_SIZE,
    Math.max(1, input.perPage ?? DEFAULT_SYNC_PAGE_SIZE),
  );
  const maxPages = Math.max(1, input.maxPages ?? DEFAULT_MAX_PAGES);
  const mode = resolveMode(input.mode ?? "auto", connection);
  const client = input.client ?? createStravaClient();
  const after = computeAfterEpochSeconds(mode, connection, now(), backfillDays);

  // Policy Gate (Req 15.3): impõe a permissão de persistência ANTES de gravar
  // qualquer atividade. Para STRAVA passa (persist=true), mas a barreira existe.
  assertPolicy("STRAVA", "persist");

  await prisma.wearableConnection.update({
    where: { id: connection.id },
    data: { status: "SYNCING", lastSyncStatus: "IN_PROGRESS", lastErrorCode: null },
  });

  logger.info("Strava sync started", {
    provider: "STRAVA",
    operation: "sync",
    status: "started",
    connectionId: connection.id,
    userId,
    mode,
  });

  let syncedCount = 0;
  let createdCount = 0;
  const ctx = { connectionId: connection.id, userId };

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      let activities;
      try {
        activities = await client.listAthleteActivities(ctx, {
          after,
          page,
          perPage,
        });
      } catch (error) {
        // Rate limit (local ou remoto): para educadamente e retoma depois.
        if (
          error instanceof StravaRateLimitError ||
          error instanceof StravaRateLimitExceededError
        ) {
          const retryAfterMs = error.retryAfterMs;
          await markRateLimited(connection.id, syncedCount, now());
          logger.warn("Strava sync paused by rate limit", {
            provider: "STRAVA",
            operation: "sync",
            status: "rate_limited",
            connectionId: connection.id,
            userId,
            retryAfterMs,
            syncedCount,
          });
          return {
            status: "rate-limited",
            connectionId: connection.id,
            mode,
            syncedCount,
            createdCount,
            retryAfterMs,
          };
        }
        throw error;
      }

      if (activities.length === 0) {
        break; // Página vazia: fim da paginação.
      }

      for (const summary of activities) {
        const normalized = parseStravaActivity(summary);
        const activityData = normalizedStravaActivityToActivityData(normalized);
        const { created, activity, cacheWasMissing } = await upsertStravaActivity(userId, connection.id, activityData);
        if (cacheWasMissing && !await cacheStravaActivityLaps(activity, client)) {
          logger.warn("Strava lap cache unavailable; it will be retried by a later sync", {
            provider: "STRAVA",
            operation: "activity_lap_backfill",
            status: "unavailable",
            connectionId: connection.id,
            activityId: activity.id,
            externalId: activity.externalId,
          });
        }
        syncedCount += 1;
        if (created) {
          createdCount += 1;
        }
      }

      if (activities.length < perPage) {
        break; // Última página parcial: fim da paginação.
      }
    }

    const completedAt = new Date(now());
    await prisma.wearableConnection.update({
      where: { id: connection.id },
      data: {
        status: "CONNECTED",
        lastSyncAt: completedAt,
        lastSuccessAt: completedAt,
        lastSyncStatus: `SYNCED_${syncedCount}`,
        lastErrorCode: null,
      },
    });

    logger.info("Strava sync completed", {
      provider: "STRAVA",
      operation: "sync",
      status: "synced",
      connectionId: connection.id,
      userId,
      mode,
      syncedCount,
      createdCount,
    });
    // Métrica rotulada por provider (Req 20.4): sincronização concluída.
    incrementIntegrationMetric({ provider: "STRAVA", metric: "sync", status: "synced" });

    return {
      status: "synced",
      connectionId: connection.id,
      mode,
      syncedCount,
      createdCount,
    };
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "STRAVA_SYNC_FAILED";

    await prisma.wearableConnection
      .update({
        where: { id: connection.id },
        data: {
          status: "ERROR",
          lastSyncStatus: "ERROR",
          lastErrorCode: errorCode,
          lastErrorAt: new Date(now()),
        },
      })
      .catch(() => {
        // Não deixa a atualização de saúde mascarar o erro original.
      });

    logger.error("Strava sync failed", {
      provider: "STRAVA",
      operation: "sync",
      status: "failed",
      connectionId: connection.id,
      userId,
      mode,
      errorCode,
      syncedCount,
    });

    return {
      status: "failed",
      connectionId: connection.id,
      mode,
      syncedCount,
      createdCount,
      errorCode,
    };
  }
}

/**
 * Atualiza a saúde da conexão quando o sync é pausado por rate limit: mantém a
 * conexão CONNECTED (não é um erro), registra progresso parcial e o evento.
 */
async function markRateLimited(
  connectionId: string,
  syncedCount: number,
  nowMs: number,
): Promise<void> {
  await prisma.wearableConnection
    .update({
      where: { id: connectionId },
      data: {
        status: "CONNECTED",
        lastSyncAt: new Date(nowMs),
        lastSyncStatus: `RATE_LIMITED_${syncedCount}`,
        lastEventAt: new Date(nowMs),
      },
    })
    .catch(() => {
      // Tolerante: falha ao atualizar saúde não deve derrubar o retorno.
    });
}
