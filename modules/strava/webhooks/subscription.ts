/**
 * Gestão da subscription (push subscription) de webhook do Strava (Task 7.2).
 *
 * O Strava trata a subscription de webhook como sendo DA APLICAÇÃO (uma única
 * por app, não uma por atleta — Req 12.7). Este módulo concentra a rotina
 * administrativa para CRIAR, VERIFICAR e APAGAR essa subscription, mantendo o
 * espelho local em `StravaWebhookSubscription` reconciliado com o estado remoto.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Endpoints confirmados na documentação oficial vigente do Strava
 * ([Strava Webhooks](https://developers.strava.com/docs/webhooks/) — conteúdo
 * PARAFRASEADO para conformidade com as restrições de licenciamento):
 *
 * - CRIAR: `POST https://www.strava.com/api/v3/push_subscriptions`, com os
 *   parâmetros enviados como HTTP form data: `client_id`, `client_secret`,
 *   `callback_url` (máx. 255 chars) e `verify_token`. A criação é um processo de
 *   dois passos: ao receber o POST, o Strava dispara um `GET` ao `callback_url`
 *   com `hub.mode`/`hub.challenge`/`hub.verify_token`; o callback deve ecoar o
 *   `hub.challenge` (HTTP 200, em até 2s) para a subscription ser validada. Só
 *   então o POST original responde com `{ "id": <n> }`. Esse handshake é servido
 *   pela rota GET já ativa em `/api/integrations/strava/webhook`.
 * - VER: `GET https://www.strava.com/api/v3/push_subscriptions` com `client_id`
 *   e `client_secret` na query string. Retorna a lista de subscriptions (a app
 *   só pode ter uma).
 * - APAGAR: `DELETE https://www.strava.com/api/v3/push_subscriptions/{id}` com
 *   `client_id` e `client_secret` na query string. Responde `204 No Content` em
 *   caso de sucesso.
 *
 * Observação (uma subscription por app): a criação FALHA se já existir uma
 * subscription. Por isso `createStravaWebhookSubscription` VÊ primeiro e, se já
 * houver uma, retorna `already-exists` (reconciliando o espelho local) em vez de
 * provocar o erro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Segurança (Req 20.1, 20.5): `client_secret` e `verify_token` NUNCA são
 * logados. Os logs carregam apenas metadados seguros (operation/status/id da
 * subscription). O `fetch` é injetável (`options.fetchImpl`) para testes
 * offline.
 *
 * _Requisitos: 12.7, 20.1, 20.5_
 */

import { z } from "zod";

import { stravaFaultSchema } from "@/modules/strava/api/schemas";
import type { StravaFaultDto } from "@/modules/strava/api/dto";
import { getStravaConfig } from "@/modules/strava/config";
import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";

/** Caminho do recurso de push subscriptions (relativo à base da API v3). */
const PUSH_SUBSCRIPTIONS_PATH = "/push_subscriptions";

/** Status persistido no espelho local `StravaWebhookSubscription`. */
export const STRAVA_SUBSCRIPTION_STATUS_ACTIVE = "ACTIVE";

/** Timeout padrão (ms) das chamadas de gestão da subscription. */
export const DEFAULT_STRAVA_SUBSCRIPTION_TIMEOUT_MS = 15_000;

/**
 * Schema da resposta de CRIAÇÃO: `{ "id": <n> }`. O `id` chega como número na
 * doc oficial; aceitamos também string por defensividade e normalizamos depois.
 */
const createSubscriptionResponseSchema = z
  .object({ id: z.union([z.number(), z.string()]) })
  .passthrough();

/**
 * Schema de UM item retornado no VIEW. Tudo além do `id` é opcional/tolerante —
 * não dependemos de campos que a doc não garante formalmente.
 */
const subscriptionItemSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    callback_url: z.string().optional(),
    application_id: z.union([z.number(), z.string()]).optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

/** Schema da resposta do VIEW: lista de subscriptions (a app só tem uma). */
const viewSubscriptionResponseSchema = z.array(subscriptionItemSchema);

/** Resumo, provider-agnostic-safe, de uma subscription do Strava. */
export interface StravaSubscriptionSummary {
  /** Id externo da subscription no Strava (sempre string internamente). */
  externalSubscriptionId: string;
  /** Callback URL registrada na subscription (quando informado pelo Strava). */
  callbackUrl?: string;
  applicationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Resultado de `createStravaWebhookSubscription`. */
export type CreateStravaWebhookSubscriptionResult =
  | { status: "created"; subscription: StravaSubscriptionSummary }
  | { status: "already-exists"; subscription: StravaSubscriptionSummary };

/** Resultado de `viewStravaWebhookSubscription`. */
export type ViewStravaWebhookSubscriptionResult =
  | { status: "found"; subscription: StravaSubscriptionSummary }
  | { status: "none" };

/** Resultado de `deleteStravaWebhookSubscription`. */
export type DeleteStravaWebhookSubscriptionResult =
  | { status: "deleted"; externalSubscriptionId: string }
  | { status: "not-found" };

/** Opções comuns (fetch/timeout injetáveis para testes offline). */
export interface StravaWebhookSubscriptionOptions {
  /** `fetch` injetável para testes (default: `fetch` global). */
  fetchImpl?: typeof fetch;
  /** Timeout por requisição (ms). Default {@link DEFAULT_STRAVA_SUBSCRIPTION_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * Erro tipado da gestão da subscription. Carrega `code` estável + metadados
 * seguros (httpStatus/fault) para observabilidade — nunca embute secrets.
 */
export class StravaWebhookSubscriptionError extends Error {
  readonly code: string;
  readonly httpStatus?: number;
  readonly fault?: StravaFaultDto;

  constructor(params: {
    code: string;
    message: string;
    httpStatus?: number;
    fault?: StravaFaultDto;
  }) {
    super(params.message);
    this.name = "StravaWebhookSubscriptionError";
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.fault = params.fault;
    Object.setPrototypeOf(this, StravaWebhookSubscriptionError.prototype);
  }
}

/** Credenciais mínimas para VER/APAGAR uma subscription (client id + secret). */
interface ResolvedCredentials {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
}

/** Resolve client id/secret + base URL, lançando se ausentes. */
function resolveCredentials(): ResolvedCredentials {
  const config = getStravaConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new StravaWebhookSubscriptionError({
      code: "STRAVA_SUBSCRIPTION_NOT_CONFIGURED",
      message:
        "STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET ausentes: não é possível gerenciar a subscription.",
    });
  }
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    apiBaseUrl: config.apiBaseUrl.replace(/\/+$/, ""),
  };
}

/** Normaliza o id (número|string) para string estável. */
function toExternalId(id: number | string): string {
  return String(id).trim();
}

/** Converte um item validado do VIEW no resumo interno. */
function toSummary(item: z.infer<typeof subscriptionItemSchema>): StravaSubscriptionSummary {
  return {
    externalSubscriptionId: toExternalId(item.id),
    callbackUrl: item.callback_url,
    applicationId:
      item.application_id !== undefined ? toExternalId(item.application_id) : undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

/** Tenta parsear o corpo de erro no DTO `Fault` (tolerante a corpos não-JSON). */
async function parseFault(response: Response): Promise<StravaFaultDto | undefined> {
  try {
    const json = await response.clone().json();
    const parsed = stravaFaultSchema.safeParse(json);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Executa UMA requisição de gestão com timeout via `AbortController`. Não trata
 * status aqui (isso fica em cada função) — apenas normaliza erros de rede.
 */
async function doFetch(
  fetchImpl: typeof fetch,
  timeoutMs: number,
  url: string,
  init: RequestInit,
  operation: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    logger.error("Strava subscription request failed at network layer", {
      provider: "STRAVA",
      operation,
      status: aborted ? "timeout" : "network_error",
    });
    throw new StravaWebhookSubscriptionError({
      code: aborted
        ? "STRAVA_SUBSCRIPTION_TIMEOUT"
        : "STRAVA_SUBSCRIPTION_NETWORK_ERROR",
      message: aborted
        ? `Tempo esgotado ao gerenciar a subscription do Strava (${operation}).`
        : `Falha de rede ao gerenciar a subscription do Strava (${operation}).`,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Upsert do espelho local a partir de um resumo remoto. */
async function persistLocalSubscription(
  summary: StravaSubscriptionSummary,
  fallbackCallbackUrl?: string,
): Promise<void> {
  const callbackUrl = summary.callbackUrl ?? fallbackCallbackUrl ?? "";
  await prisma.stravaWebhookSubscription.upsert({
    where: { externalSubscriptionId: summary.externalSubscriptionId },
    update: { callbackUrl, status: STRAVA_SUBSCRIPTION_STATUS_ACTIVE },
    create: {
      externalSubscriptionId: summary.externalSubscriptionId,
      callbackUrl,
      status: STRAVA_SUBSCRIPTION_STATUS_ACTIVE,
    },
  });
}

/**
 * Remove do espelho local qualquer linha cujo `externalSubscriptionId` não
 * esteja no conjunto informado (limpeza de registros obsoletos). Passe um
 * conjunto vazio para remover TODOS os espelhos.
 */
async function pruneLocalExcept(keepIds: Set<string>): Promise<void> {
  const ids = [...keepIds];
  await prisma.stravaWebhookSubscription
    .deleteMany({
      where: ids.length > 0 ? { externalSubscriptionId: { notIn: ids } } : {},
    })
    .catch(() => {
      // Reconciliação do espelho é best-effort: não deve mascarar o resultado
      // remoto (a fonte de verdade é o Strava).
    });
}

/**
 * VÊ a subscription atual da aplicação (`GET /push_subscriptions`) e reconcilia
 * o espelho local com o estado remoto (fonte de verdade = Strava).
 *
 * @returns `found` com o resumo quando existe uma subscription; `none` caso a
 *   aplicação não tenha subscription registrada no Strava.
 */
export async function viewStravaWebhookSubscription(
  options: StravaWebhookSubscriptionOptions = {},
): Promise<ViewStravaWebhookSubscriptionResult> {
  const { clientId, clientSecret, apiBaseUrl } = resolveCredentials();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_STRAVA_SUBSCRIPTION_TIMEOUT_MS;

  const query = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
  });
  const url = `${apiBaseUrl}${PUSH_SUBSCRIPTIONS_PATH}?${query.toString()}`;

  const response = await doFetch(
    fetchImpl,
    timeoutMs,
    url,
    { method: "GET", headers: { Accept: "application/json" } },
    "subscription_view",
  );

  if (!response.ok) {
    const fault = await parseFault(response);
    logger.error("Strava subscription view returned error status", {
      provider: "STRAVA",
      operation: "subscription_view",
      status: "http_error",
      httpStatus: response.status,
    });
    throw new StravaWebhookSubscriptionError({
      code: "STRAVA_SUBSCRIPTION_VIEW_FAILED",
      message: `Strava respondeu status ${response.status} ao listar a subscription.`,
      httpStatus: response.status,
      fault,
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new StravaWebhookSubscriptionError({
      code: "STRAVA_SUBSCRIPTION_INVALID_JSON",
      message: "Resposta do Strava ao listar a subscription não é JSON válido.",
      httpStatus: response.status,
    });
  }

  const parsed = viewSubscriptionResponseSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn("Strava subscription view failed schema validation", {
      provider: "STRAVA",
      operation: "subscription_view",
      status: "invalid_response",
      httpStatus: response.status,
    });
    throw new StravaWebhookSubscriptionError({
      code: "STRAVA_SUBSCRIPTION_INVALID_RESPONSE",
      message: "Resposta do Strava ao listar a subscription não passou na validação.",
      httpStatus: response.status,
    });
  }

  const first = parsed.data[0];
  if (!first) {
    // Nenhuma subscription remota: espelho local fica obsoleto → limpa tudo.
    await pruneLocalExcept(new Set());
    logger.info("Strava subscription view: none registered", {
      provider: "STRAVA",
      operation: "subscription_view",
      status: "none",
    });
    return { status: "none" };
  }

  const summary = toSummary(first);
  await persistLocalSubscription(summary);
  await pruneLocalExcept(new Set([summary.externalSubscriptionId]));

  logger.info("Strava subscription view: found", {
    provider: "STRAVA",
    operation: "subscription_view",
    status: "found",
    subscriptionId: summary.externalSubscriptionId,
  });

  return { status: "found", subscription: summary };
}

/**
 * CRIA a subscription de webhook da aplicação (`POST /push_subscriptions`).
 *
 * Como o Strava só admite UMA subscription por app, esta função VÊ primeiro: se
 * já existir uma, retorna `already-exists` (reconciliando o espelho local) em
 * vez de provocar o erro de criação. Caso não exista, faz o POST com
 * `client_id`/`client_secret`/`callback_url`/`verify_token` como form data e, no
 * sucesso, persiste o espelho local (`ACTIVE`).
 *
 * Requer `STRAVA_WEBHOOK_CALLBACK_URL` (a rota pública do webhook) e
 * `STRAVA_WEBHOOK_VERIFY_TOKEN` configurados.
 */
export async function createStravaWebhookSubscription(
  options: StravaWebhookSubscriptionOptions = {},
): Promise<CreateStravaWebhookSubscriptionResult> {
  const { clientId, clientSecret, apiBaseUrl } = resolveCredentials();
  const config = getStravaConfig();
  const callbackUrl = config.webhook.callbackUrl;
  const verifyToken = config.webhook.verifyToken;

  if (!callbackUrl) {
    throw new StravaWebhookSubscriptionError({
      code: "STRAVA_SUBSCRIPTION_NO_CALLBACK_URL",
      message:
        "STRAVA_WEBHOOK_CALLBACK_URL ausente: defina a rota pública do webhook antes de criar a subscription.",
    });
  }
  if (!verifyToken) {
    throw new StravaWebhookSubscriptionError({
      code: "STRAVA_SUBSCRIPTION_NO_VERIFY_TOKEN",
      message:
        "STRAVA_WEBHOOK_VERIFY_TOKEN ausente: é obrigatório para validar o challenge da subscription.",
    });
  }

  // Uma por app: se já existir, não tenta criar de novo (evita o erro do Strava).
  const existing = await viewStravaWebhookSubscription(options);
  if (existing.status === "found") {
    logger.info("Strava subscription already exists; skipping create", {
      provider: "STRAVA",
      operation: "subscription_create",
      status: "already_exists",
      subscriptionId: existing.subscription.externalSubscriptionId,
    });
    return { status: "already-exists", subscription: existing.subscription };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_STRAVA_SUBSCRIPTION_TIMEOUT_MS;

  // Parâmetros como form data (application/x-www-form-urlencoded), conforme doc.
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    callback_url: callbackUrl,
    verify_token: verifyToken,
  });

  const url = `${apiBaseUrl}${PUSH_SUBSCRIPTIONS_PATH}`;
  const response = await doFetch(
    fetchImpl,
    timeoutMs,
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    },
    "subscription_create",
  );

  if (!response.ok) {
    const fault = await parseFault(response);
    logger.error("Strava subscription create returned error status", {
      provider: "STRAVA",
      operation: "subscription_create",
      status: "http_error",
      httpStatus: response.status,
    });
    throw new StravaWebhookSubscriptionError({
      code: "STRAVA_SUBSCRIPTION_CREATE_FAILED",
      message: `Strava respondeu status ${response.status} ao criar a subscription.`,
      httpStatus: response.status,
      fault,
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new StravaWebhookSubscriptionError({
      code: "STRAVA_SUBSCRIPTION_INVALID_JSON",
      message: "Resposta do Strava ao criar a subscription não é JSON válido.",
      httpStatus: response.status,
    });
  }

  const parsed = createSubscriptionResponseSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn("Strava subscription create failed schema validation", {
      provider: "STRAVA",
      operation: "subscription_create",
      status: "invalid_response",
      httpStatus: response.status,
    });
    throw new StravaWebhookSubscriptionError({
      code: "STRAVA_SUBSCRIPTION_INVALID_RESPONSE",
      message: "Resposta do Strava ao criar a subscription não passou na validação.",
      httpStatus: response.status,
    });
  }

  const summary: StravaSubscriptionSummary = {
    externalSubscriptionId: toExternalId(parsed.data.id),
    callbackUrl,
  };
  await persistLocalSubscription(summary, callbackUrl);
  await pruneLocalExcept(new Set([summary.externalSubscriptionId]));

  logger.info("Strava subscription created", {
    provider: "STRAVA",
    operation: "subscription_create",
    status: "created",
    subscriptionId: summary.externalSubscriptionId,
  });

  return { status: "created", subscription: summary };
}

/**
 * APAGA a subscription de webhook da aplicação
 * (`DELETE /push_subscriptions/{id}`). Se `subscriptionId` não for informado,
 * resolve o id via VIEW remoto e, como fallback, pelo espelho local.
 *
 * `204 No Content` = sucesso; `404` é tratado como idempotente (a subscription
 * já não existe). Em ambos os casos o espelho local é limpo.
 */
export async function deleteStravaWebhookSubscription(
  subscriptionId?: string,
  options: StravaWebhookSubscriptionOptions = {},
): Promise<DeleteStravaWebhookSubscriptionResult> {
  const { clientId, clientSecret, apiBaseUrl } = resolveCredentials();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_STRAVA_SUBSCRIPTION_TIMEOUT_MS;

  // Resolve o id: parâmetro → VIEW remoto → espelho local.
  let externalSubscriptionId = subscriptionId?.trim();
  if (!externalSubscriptionId) {
    const view = await viewStravaWebhookSubscription(options);
    if (view.status === "found") {
      externalSubscriptionId = view.subscription.externalSubscriptionId;
    } else {
      const local = await prisma.stravaWebhookSubscription.findFirst({
        select: { externalSubscriptionId: true },
      });
      externalSubscriptionId = local?.externalSubscriptionId;
    }
  }

  if (!externalSubscriptionId) {
    logger.info("Strava subscription delete: nothing to delete", {
      provider: "STRAVA",
      operation: "subscription_delete",
      status: "not_found",
    });
    return { status: "not-found" };
  }

  const query = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
  });
  const url = `${apiBaseUrl}${PUSH_SUBSCRIPTIONS_PATH}/${encodeURIComponent(
    externalSubscriptionId,
  )}?${query.toString()}`;

  const response = await doFetch(
    fetchImpl,
    timeoutMs,
    url,
    { method: "DELETE", headers: { Accept: "application/json" } },
    "subscription_delete",
  );

  // 404: já não existe no Strava → idempotente; limpa espelho e retorna deleted.
  if (response.status === 404) {
    await prisma.stravaWebhookSubscription
      .deleteMany({ where: { externalSubscriptionId } })
      .catch(() => undefined);
    logger.info("Strava subscription already absent on delete (404); treated as deleted", {
      provider: "STRAVA",
      operation: "subscription_delete",
      status: "already_absent",
      subscriptionId: externalSubscriptionId,
    });
    return { status: "deleted", externalSubscriptionId };
  }

  // Sucesso é 204 No Content; aceitamos qualquer 2xx defensivamente.
  if (!response.ok && response.status !== 204) {
    const fault = await parseFault(response);
    logger.error("Strava subscription delete returned error status", {
      provider: "STRAVA",
      operation: "subscription_delete",
      status: "http_error",
      httpStatus: response.status,
    });
    throw new StravaWebhookSubscriptionError({
      code: "STRAVA_SUBSCRIPTION_DELETE_FAILED",
      message: `Strava respondeu status ${response.status} ao apagar a subscription.`,
      httpStatus: response.status,
      fault,
    });
  }

  await prisma.stravaWebhookSubscription
    .deleteMany({ where: { externalSubscriptionId } })
    .catch(() => undefined);

  logger.info("Strava subscription deleted", {
    provider: "STRAVA",
    operation: "subscription_delete",
    status: "deleted",
    subscriptionId: externalSubscriptionId,
  });

  return { status: "deleted", externalSubscriptionId };
}
