/**
 * Processor idempotente de eventos de webhook do Strava (Task 7.1).
 *
 * A rota (Task 7) apenas persiste `StravaWebhookEvent(PENDING)` e responde
 * rápido. Este processor faz o trabalho pesado, de forma assíncrona (acionado
 * pelo job da Task 8.1): lê eventos PENDING, resolve a conexão pelo `owner_id`
 * (athleteId), e aplica o efeito conforme `object_type`/`aspect_type`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Semântica dos eventos, confirmada na documentação oficial vigente do Strava
 * ([Strava Webhooks](https://developers.strava.com/docs/webhooks/) — conteúdo
 * PARAFRASEADO para conformidade com as restrições de licenciamento):
 *
 * - `object_type` é sempre `"activity"` ou `"athlete"`.
 * - `aspect_type` é sempre `"create"`, `"update"` ou `"delete"`.
 * - `owner_id` é o id do atleta dono do objeto.
 * - Em updates de atividade, `updates` pode conter `title`/`type`/`private`.
 * - Em desautorização do app, o evento é de `athlete` e `updates` contém sempre
 *   o par `authorized: "false"`.
 * - O corpo do evento NÃO traz os dados da atividade: se forem necessários, a
 *   aplicação deve buscá-los via API (`GET /activities/{id}`), e só quando fizer
 *   sentido (aqui: em create/update de atividade).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Idempotência e dedupe (Req 12.5, 12.6):
 *   - Eventos já marcados PROCESSED são pulados (no-op).
 *   - O upsert da atividade é chaveado por `(provider, externalId, userId)`, de
 *     modo que reprocessar o MESMO evento converge para o mesmo estado sem
 *     duplicar (a identidade mínima exigida pelo Req 12.5).
 *
 * Resolução da conexão (Req 12b.2): `owner_id` → `StravaConnectionDetails.
 * athleteId` → `WearableConnection`. Atleta desconhecido é IGNORADO (marcado
 * PROCESSED, sem erro) — não confiamos cegamente no conteúdo do POST (Req 20.5).
 *
 * Política de dados (Req 15.3): antes de persistir qualquer atividade,
 * `assertPolicy("STRAVA", "persist")`.
 *
 * Retry/backoff (Req 12.5, 18.3): falhas TRANSITÓRIAS (rate limit, rede,
 * timeout, 5xx) incrementam `attemptCount` e deixam o evento PENDING para o job
 * reprocessar depois (o intervalo entre execuções do job atua como backoff).
 * Ao atingir {@link MAX_STRAVA_WEBHOOK_ATTEMPTS}, o evento é marcado FAILED.
 * Falhas PERMANENTES (401 após refresh, payload/resposta inválida, violação de
 * política) marcam FAILED imediatamente. Sucesso marca PROCESSED.
 *
 * Delete e deauthorization: DELEGADOS às rotinas de purge de
 * `modules/strava/application/cleanup` (`purgeDeletedActivityData`/
 * `purgeDeauthorizedUserData`, Task 7.3). O processor só orquestra (resolve a
 * conexão, chama o purge e marca o evento PROCESSED); a remoção efetiva dos
 * dados vive na camada de cleanup. A dependência é unidirecional (processor →
 * cleanup), sem ciclo de importação.
 *
 * Observabilidade (Req 20.3/20.4): logs com provider/operation/status/
 * connectionId; nunca conteúdo do payload, tokens ou PII.
 *
 * _Requisitos: 12.4, 12.5, 12.6, 18.3, 15.3, 20.5_
 */

import { assertPolicy } from "@/modules/shared/integrations/policy";
import { incrementIntegrationMetric } from "@/modules/shared/integrations/observability";
import {
  purgeDeauthorizedUserData,
  purgeDeletedActivityData,
} from "@/modules/strava/application/cleanup";
import {
  createStravaClient,
  StravaAuthError,
  StravaClient,
  StravaClientError,
  StravaRateLimitError,
  StravaRateLimitExceededError,
} from "@/modules/strava/api/client";
import { normalizedStravaActivityToActivityData } from "@/modules/strava/database/mappers/normalized-activity-to-activity";
import { upsertStravaActivity } from "@/modules/strava/database/repositories/upsert-strava-activity";
import { parseStravaActivity } from "@/modules/strava/parsers/parse-strava-activity";
import {
  STRAVA_WEBHOOK_STATUS_FAILED,
  STRAVA_WEBHOOK_STATUS_PENDING,
  STRAVA_WEBHOOK_STATUS_PROCESSED,
} from "@/modules/strava/webhooks/handler";
import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";

/**
 * Máximo de tentativas de processamento de um evento antes de marcá-lo FAILED.
 * Depois disso, reprocessar é responsabilidade de uma ação manual/operacional.
 */
export const MAX_STRAVA_WEBHOOK_ATTEMPTS = 5;

/** Itens processados por execução em batch (default do job — Task 8.1). */
export const DEFAULT_STRAVA_WEBHOOK_BATCH_LIMIT = 50;

/** Resultado do processamento de um único evento. */
export type StravaWebhookEventOutcome =
  /** Efeito aplicado com sucesso (upsert/purge/deauth) — evento PROCESSED. */
  | "processed"
  /** Atleta desconhecido — evento IGNORADO/PROCESSED (Req 12b.2). */
  | "ignored-unknown-athlete"
  /** Evento sem efeito aplicável (ex.: activity sem create/update/delete). */
  | "ignored"
  /** Evento já estava PROCESSED — no-op idempotente. */
  | "already-processed"
  /** Evento não encontrado pelo id informado. */
  | "not-found"
  /** Falha transitória — evento permanece PENDING para retry posterior. */
  | "retry"
  /** Falha permanente ou tentativas esgotadas — evento FAILED. */
  | "failed";

/** Opções comuns de processamento (client/relógio injetáveis para testes). */
export interface ProcessStravaWebhookOptions {
  /** Client injetável (default `createStravaClient()`). */
  client?: StravaClient;
  /** Relógio injetável (default `Date.now`), para testes determinísticos. */
  now?: () => number;
}

/** Opções do processamento em batch. */
export interface ProcessPendingStravaWebhookEventsInput
  extends ProcessStravaWebhookOptions {
  /** Máximo de eventos a processar nesta execução. */
  limit?: number;
}

/** Resumo do processamento em batch. */
export interface ProcessPendingStravaWebhookEventsResult {
  /** Total de eventos lidos/processados nesta execução. */
  total: number;
  processed: number;
  ignored: number;
  retried: number;
  failed: number;
}

/** Linha mínima do evento necessária ao processamento. */
interface StravaWebhookEventRecord {
  id: string;
  ownerAthleteId: string | null;
  objectType: string;
  objectId: string;
  aspectType: string;
  eventTime: Date;
  payload: unknown;
  processingStatus: string;
  attemptCount: number;
}

const EVENT_SELECT = {
  id: true,
  ownerAthleteId: true,
  objectType: true,
  objectId: true,
  aspectType: true,
  eventTime: true,
  payload: true,
  processingStatus: true,
  attemptCount: true,
} as const;

/** Conexão resolvida a partir do `owner_id`/athleteId do evento. */
interface ResolvedStravaConnection {
  connectionId: string;
  userId: string;
}

/**
 * Extrai o objeto `updates` do payload persistido de forma defensiva (o payload
 * é `Json`; suas chaves variam e os valores chegam como string).
 */
function readUpdates(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const updates = (payload as Record<string, unknown>).updates;
    if (updates && typeof updates === "object" && !Array.isArray(updates)) {
      return updates as Record<string, unknown>;
    }
  }
  return {};
}

/** Indica se o evento de atleta representa uma desautorização do app. */
function isDeauthorizationEvent(event: StravaWebhookEventRecord): boolean {
  if (event.objectType !== "athlete") {
    return false;
  }
  const updates = readUpdates(event.payload);
  // A doc garante `authorized: "false"` (string) em deauthorization.
  return String(updates.authorized ?? "").toLowerCase() === "false";
}

/**
 * Resolve a conexão Strava dona do evento pelo `ownerAthleteId`
 * (`StravaConnectionDetails.athleteId` → `WearableConnection`). Retorna `null`
 * quando o atleta é desconhecido (evento a ser ignorado).
 */
async function resolveConnectionByAthlete(
  ownerAthleteId: string | null,
): Promise<ResolvedStravaConnection | null> {
  if (!ownerAthleteId || ownerAthleteId.trim() === "") {
    return null;
  }

  const details = await prisma.stravaConnectionDetails.findUnique({
    where: { athleteId: ownerAthleteId },
    select: {
      wearableConnectionId: true,
      wearableConnection: { select: { userId: true } },
    },
  });

  if (!details) {
    return null;
  }

  return {
    connectionId: details.wearableConnectionId,
    userId: details.wearableConnection.userId,
  };
}

/** Marca o evento como PROCESSED (com timestamp). */
async function markProcessed(eventId: string, nowMs: number): Promise<void> {
  await prisma.stravaWebhookEvent.update({
    where: { id: eventId },
    data: {
      processingStatus: STRAVA_WEBHOOK_STATUS_PROCESSED,
      processedAt: new Date(nowMs),
    },
  });
}

/** Marca o evento como FAILED (tentativas esgotadas ou falha permanente). */
async function markFailed(
  eventId: string,
  attemptCount: number,
  nowMs: number,
): Promise<void> {
  await prisma.stravaWebhookEvent.update({
    where: { id: eventId },
    data: {
      processingStatus: STRAVA_WEBHOOK_STATUS_FAILED,
      attemptCount,
      processedAt: new Date(nowMs),
    },
  });
}

/** Deixa o evento PENDING com `attemptCount` atualizado (retry posterior). */
async function markPendingRetry(
  eventId: string,
  attemptCount: number,
): Promise<void> {
  await prisma.stravaWebhookEvent.update({
    where: { id: eventId },
    data: {
      processingStatus: STRAVA_WEBHOOK_STATUS_PENDING,
      attemptCount,
    },
  });
}

/** Atualiza, de forma tolerante, o `lastEventAt` da conexão. */
async function touchConnectionEvent(
  connectionId: string,
  nowMs: number,
  success: boolean,
): Promise<void> {
  await prisma.wearableConnection
    .update({
      where: { id: connectionId },
      data: {
        lastEventAt: new Date(nowMs),
        ...(success ? { lastSuccessAt: new Date(nowMs) } : {}),
      },
    })
    .catch(() => {
      // Saúde da conexão é best-effort: não deve mascarar o resultado do evento.
    });
}

/**
 * Classifica um erro como TRANSITÓRIO (vale retry) ou PERMANENTE (marca FAILED).
 *
 * Transitório: rate limit (local/remoto), rede, timeout e 5xx.
 * Permanente: 401 após refresh (reauth), payload/resposta inválida, violação de
 * política e demais erros de client 4xx (exceto 429).
 */
function isTransientError(error: unknown): boolean {
  if (
    error instanceof StravaRateLimitError ||
    error instanceof StravaRateLimitExceededError
  ) {
    return true;
  }

  if (error instanceof StravaAuthError) {
    return false; // 401 persistente → precisa de reautorização.
  }

  if (error instanceof StravaClientError) {
    if (
      error.code === "STRAVA_CLIENT_NETWORK_ERROR" ||
      error.code === "STRAVA_CLIENT_TIMEOUT"
    ) {
      return true;
    }
    if (
      error.code === "STRAVA_HTTP_ERROR" &&
      typeof error.httpStatus === "number" &&
      error.httpStatus >= 500
    ) {
      return true;
    }
    return false;
  }

  // Erros desconhecidos: tratados como transitórios (com teto de tentativas).
  return true;
}

/** Detecta um 404 do `GET /activities/{id}` (recurso ausente/inacessível). */
function isActivityNotFound(error: unknown): boolean {
  return (
    error instanceof StravaClientError &&
    error.code === "STRAVA_HTTP_ERROR" &&
    error.httpStatus === 404
  );
}

/**
 * Re-exporta as rotinas de purge da camada de cleanup para preservar a
 * superfície pública histórica do webhook (o barrel `webhooks/index.ts` e o
 * `modules/strava/index.ts` reexportam daqui). A lógica real de remoção vive em
 * `modules/strava/application/cleanup`; o processor apenas as orquestra.
 */
export { purgeDeauthorizedUserData, purgeDeletedActivityData };

/**
 * Aplica o efeito de um evento de atividade `create`/`update`: busca a atividade
 * na API, normaliza e faz o upsert idempotente. Lança em falha (o chamador
 * classifica transitório x permanente).
 */
async function applyActivityUpsert(
  event: StravaWebhookEventRecord,
  connection: ResolvedStravaConnection,
  client: StravaClient,
): Promise<void> {
  // Policy Gate (Req 15.3): impõe a permissão de persistência ANTES de gravar.
  assertPolicy("STRAVA", "persist");

  const detailed = await client.getActivityById(
    { connectionId: connection.connectionId, userId: connection.userId },
    event.objectId,
  );

  const normalized = parseStravaActivity(detailed);
  const activityData = normalizedStravaActivityToActivityData(normalized);

  await upsertStravaActivity({
    userId: connection.userId,
    connectionId: connection.connectionId,
    activityData,
  });
}

/**
 * Processa UM evento de webhook do Strava a partir do id. Idempotente.
 *
 * @returns o `outcome` do processamento (ver {@link StravaWebhookEventOutcome}).
 */
export async function processStravaWebhookEvent(
  eventId: string,
  options: ProcessStravaWebhookOptions = {},
): Promise<StravaWebhookEventOutcome> {
  const event = await prisma.stravaWebhookEvent.findUnique({
    where: { id: eventId },
    select: EVENT_SELECT,
  });

  if (!event) {
    incrementIntegrationMetric({
      provider: "STRAVA",
      metric: "webhook",
      status: "not-found",
    });
    return "not-found";
  }

  const outcome = await processEventRecord(event, options);
  // Métrica rotulada por provider (Req 20.4): evento de webhook processado.
  incrementIntegrationMetric({ provider: "STRAVA", metric: "webhook", status: outcome });
  return outcome;
}

/**
 * Núcleo do processamento de um evento já carregado. Separado para o batch
 * reaproveitar sem uma segunda leitura.
 */
async function processEventRecord(
  event: StravaWebhookEventRecord,
  options: ProcessStravaWebhookOptions,
): Promise<StravaWebhookEventOutcome> {
  const now = options.now ?? Date.now;

  // Idempotência: eventos já processados são no-op.
  if (event.processingStatus === STRAVA_WEBHOOK_STATUS_PROCESSED) {
    return "already-processed";
  }

  // Resolução por owner_id/athleteId. Atleta desconhecido → ignora (Req 12b.2).
  const connection = await resolveConnectionByAthlete(event.ownerAthleteId);
  if (!connection) {
    await markProcessed(event.id, now());
    logger.info("Strava webhook event ignored: unknown athlete", {
      provider: "STRAVA",
      operation: "webhook_process",
      status: "ignored_unknown_athlete",
      objectType: event.objectType,
      aspectType: event.aspectType,
    });
    return "ignored-unknown-athlete";
  }

  const client = options.client ?? createStravaClient();

  try {
    // 1. Desautorização do app (object_type=athlete, updates.authorized=false).
    if (isDeauthorizationEvent(event)) {
      await purgeDeauthorizedUserData({
        userId: connection.userId,
        connectionId: connection.connectionId,
      });
      await markProcessed(event.id, now());
      await touchConnectionEvent(connection.connectionId, now(), true);
      return "processed";
    }

    // 2. Eventos de atividade.
    if (event.objectType === "activity") {
      if (event.aspectType === "create" || event.aspectType === "update") {
        try {
          await applyActivityUpsert(event, connection, client);
        } catch (error) {
          // 404: atividade inacessível/removida. Idempotente: nada a upsertar,
          // marca PROCESSED (não é falha — o recurso simplesmente não existe).
          if (isActivityNotFound(error)) {
            await markProcessed(event.id, now());
            logger.info("Strava activity not found on fetch; treated as no-op", {
              provider: "STRAVA",
              operation: "webhook_process",
              status: "activity_not_found",
              connectionId: connection.connectionId,
            });
            return "ignored";
          }
          throw error;
        }

        await markProcessed(event.id, now());
        await touchConnectionEvent(connection.connectionId, now(), true);
        logger.info("Strava webhook activity event processed", {
          provider: "STRAVA",
          operation: "webhook_process",
          status: "processed",
          connectionId: connection.connectionId,
          aspectType: event.aspectType,
        });
        return "processed";
      }

      if (event.aspectType === "delete") {
        await purgeDeletedActivityData({
          externalId: event.objectId,
          userId: connection.userId,
          connectionId: connection.connectionId,
        });
        await markProcessed(event.id, now());
        await touchConnectionEvent(connection.connectionId, now(), true);
        return "processed";
      }
    }

    // 3. Qualquer outro caso (ex.: athlete/update sem deauthorization): sem
    //    efeito aplicável — marca PROCESSED para não represar a fila.
    await markProcessed(event.id, now());
    logger.info("Strava webhook event had no applicable effect; ignored", {
      provider: "STRAVA",
      operation: "webhook_process",
      status: "ignored",
      objectType: event.objectType,
      aspectType: event.aspectType,
    });
    return "ignored";
  } catch (error) {
    const attemptCount = event.attemptCount + 1;
    const transient = isTransientError(error);
    const errorCode =
      error instanceof StravaClientError ? error.code : "STRAVA_WEBHOOK_PROCESS_ERROR";

    if (transient && attemptCount < MAX_STRAVA_WEBHOOK_ATTEMPTS) {
      await markPendingRetry(event.id, attemptCount);
      await touchConnectionEvent(connection.connectionId, now(), false);
      logger.warn("Strava webhook event processing failed; will retry", {
        provider: "STRAVA",
        operation: "webhook_process",
        status: "retry",
        connectionId: connection.connectionId,
        attemptCount,
        errorCode,
      });
      return "retry";
    }

    await markFailed(event.id, attemptCount, now());
    await touchConnectionEvent(connection.connectionId, now(), false);
    logger.error("Strava webhook event processing failed permanently", {
      provider: "STRAVA",
      operation: "webhook_process",
      status: "failed",
      connectionId: connection.connectionId,
      attemptCount,
      errorCode,
      transient,
    });
    return "failed";
  }
}

/**
 * Processa um LOTE de eventos PENDENTES (mais antigos primeiro). Acionável pelo
 * job (Task 8.1). Não lança: agrega os resultados por evento.
 *
 * @returns o resumo com contagens por desfecho.
 */
export async function processPendingStravaWebhookEvents(
  input: ProcessPendingStravaWebhookEventsInput = {},
): Promise<ProcessPendingStravaWebhookEventsResult> {
  const limit = Math.max(1, input.limit ?? DEFAULT_STRAVA_WEBHOOK_BATCH_LIMIT);

  const pending = await prisma.stravaWebhookEvent.findMany({
    where: { processingStatus: STRAVA_WEBHOOK_STATUS_PENDING },
    orderBy: { receivedAt: "asc" },
    take: limit,
    select: EVENT_SELECT,
  });

  const result: ProcessPendingStravaWebhookEventsResult = {
    total: pending.length,
    processed: 0,
    ignored: 0,
    retried: 0,
    failed: 0,
  };

  for (const event of pending) {
    const outcome = await processEventRecord(event, {
      client: input.client,
      now: input.now,
    });
    // Métrica rotulada por provider (Req 20.4): evento de webhook processado.
    incrementIntegrationMetric({ provider: "STRAVA", metric: "webhook", status: outcome });

    switch (outcome) {
      case "processed":
        result.processed += 1;
        break;
      case "ignored":
      case "ignored-unknown-athlete":
      case "already-processed":
        result.ignored += 1;
        break;
      case "retry":
        result.retried += 1;
        break;
      case "failed":
      case "not-found":
        result.failed += 1;
        break;
    }
  }

  logger.info("Strava webhook batch processed", {
    provider: "STRAVA",
    operation: "webhook_batch",
    status: "done",
    ...result,
  });

  return result;
}
