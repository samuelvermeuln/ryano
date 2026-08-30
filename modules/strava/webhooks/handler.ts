/**
 * Handlers do webhook do Strava (Task 7) — lógica do módulo por trás da rota
 * fina `app/api/integrations/strava/webhook/route.ts`.
 *
 * Responsabilidades:
 *   - GET (validação de subscription): valida o challenge via
 *     `verifyStravaWebhookChallenge` e responde 200 com
 *     `{ "hub.challenge": <valor> }` quando válido; 403 quando inválido.
 *   - POST (evento): valida o payload com `stravaWebhookEventSchema` (Task 6.1),
 *     persiste um `StravaWebhookEvent(PENDING)` de forma dedupe-aware e responde
 *     RÁPIDO (200) — o processamento pesado fica a cargo do `processor` (Task
 *     7.1), acionado por job (Task 8.1). Payload inválido → 400.
 *
 * Por que responder rápido: o Strava exige um 200 em até ~2 segundos e re-tenta
 * (até 3 vezes) caso não receba (confirmado na doc oficial vigente —
 * [Strava Webhooks](https://developers.strava.com/docs/webhooks/), parafraseado
 * para conformidade de licenciamento). Persistir + retornar é O(1) e barato;
 * buscar a atividade na API (lenta, sujeita a rate limit) acontece depois.
 *
 * Segurança (Req 20.5): o Strava NÃO assina os POSTs de evento (só há o
 * `verify_token` do challenge — ver Req 12b). Portanto tratamos os eventos
 * defensivamente: validação de shape (Zod), dedupe e resolução por `owner_id`
 * feita no processor (atleta desconhecido é descartado). Nunca logamos o
 * conteúdo do payload nem tokens/PII — apenas metadados seguros (tipo/aspecto/
 * ids numéricos do Strava).
 *
 * _Requisitos: 12.1, 12.2, 12.3, 12b.1, 12b.2, 20.5_
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getProviderPolicy } from "@/modules/shared/integrations/policy";
import { stravaWebhookEventSchema } from "@/modules/strava/api/schemas";
import type { StravaWebhookEventDto } from "@/modules/strava/api/dto/strava-webhook-event";
import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";

import {
  verifyStravaWebhookChallenge,
  type StravaWebhookChallengeQuery,
} from "@/modules/strava/webhooks/validation";

/**
 * Teto de bytes do corpo do POST de evento. Os eventos do Strava são pequenos
 * (poucas centenas de bytes); um teto conservador protege contra abuso, já que
 * a rota é pública e sem assinatura por evento (Req 20.5).
 */
const MAX_WEBHOOK_BYTES = 16 * 1024;

/**
 * TTL (segundos) do payload de webhook persistido. Alinhado à política de
 * retenção conservadora do Strava (`maxCacheAgeSeconds`, ver Policy Gate); com
 * fallback de 7 dias. O cleanup (Task 8) removerá eventos expirados. Tratamos
 * `StravaWebhookEvent` como transitório, não como histórico permanente
 * (Req 17.1).
 */
const DEFAULT_STRAVA_WEBHOOK_EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Status de processamento persistido (espelha o comentário do schema Prisma). */
export const STRAVA_WEBHOOK_STATUS_PENDING = "PENDING";
export const STRAVA_WEBHOOK_STATUS_PROCESSED = "PROCESSED";
export const STRAVA_WEBHOOK_STATUS_FAILED = "FAILED";

/** Resultado da ingestão (persistência) de um evento de webhook. */
export type StravaWebhookIngestResult =
  | { status: "persisted"; eventId: string }
  | { status: "duplicate"; eventId: string }
  | { status: "invalid" };

/** Opções de `ingestStravaWebhookEvent` (relógio injetável para testes). */
export interface IngestStravaWebhookEventOptions {
  now?: () => number;
}

/** Resolve o TTL (segundos) do evento a partir da política do Strava. */
function resolveWebhookEventTtlSeconds(): number {
  const maxCacheAgeSeconds = getProviderPolicy("STRAVA").maxCacheAgeSeconds;
  return typeof maxCacheAgeSeconds === "number" && maxCacheAgeSeconds > 0
    ? maxCacheAgeSeconds
    : DEFAULT_STRAVA_WEBHOOK_EVENT_TTL_SECONDS;
}

/** Converte `event_time` (epoch em segundos) do Strava em `Date`. */
function eventTimeToDate(eventTime: number): Date {
  return new Date(eventTime * 1000);
}

/**
 * Persiste um evento de webhook validado como `StravaWebhookEvent(PENDING)`, de
 * forma idempotente/dedupe-aware.
 *
 * Dedupe (Req 12.5/12.6): o model `StravaWebhookEvent` não tem constraint única
 * sobre os campos de negócio, então a de-duplicação é feita por consulta —
 * procuramos um evento equivalente por `(objectType, objectId, aspectType,
 * eventTime)`. Se já existe (independente do status), NÃO criamos outro e
 * retornamos `duplicate` (no-op). O processamento em si também é idempotente
 * (upsert por `provider+externalId+userId`), então uma corrida que insira dois
 * registros ainda converge para o mesmo estado da `Activity`.
 *
 * NÃO processa nada aqui: apenas registra o evento e retorna. O processamento é
 * do `processor` (Task 7.1).
 */
export async function ingestStravaWebhookEvent(
  payload: unknown,
  options: IngestStravaWebhookEventOptions = {},
): Promise<StravaWebhookIngestResult> {
  const parsed = stravaWebhookEventSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn("Strava webhook payload failed schema validation", {
      provider: "STRAVA",
      operation: "webhook_ingest",
      status: "invalid_payload",
    });
    return { status: "invalid" };
  }

  const event: StravaWebhookEventDto = parsed.data;
  const now = options.now ?? Date.now;
  const eventTime = eventTimeToDate(event.event_time);
  const objectId = String(event.object_id);
  const ownerAthleteId = String(event.owner_id);

  // Dedupe por identidade de negócio do evento.
  const existing = await prisma.stravaWebhookEvent.findFirst({
    where: {
      objectType: event.object_type,
      objectId,
      aspectType: event.aspect_type,
      eventTime,
    },
    select: { id: true },
  });

  if (existing) {
    logger.info("Strava webhook event deduplicated (already received)", {
      provider: "STRAVA",
      operation: "webhook_ingest",
      status: "duplicate",
      objectType: event.object_type,
      aspectType: event.aspect_type,
    });
    return { status: "duplicate", eventId: existing.id };
  }

  const expiresAt = new Date(now() + resolveWebhookEventTtlSeconds() * 1000);

  const created = await prisma.stravaWebhookEvent.create({
    data: {
      ownerAthleteId,
      objectType: event.object_type,
      objectId,
      aspectType: event.aspect_type,
      eventTime,
      payload: event as unknown as Prisma.InputJsonValue,
      processingStatus: STRAVA_WEBHOOK_STATUS_PENDING,
      expiresAt,
    },
    select: { id: true },
  });

  logger.info("Strava webhook event received and queued", {
    provider: "STRAVA",
    operation: "webhook_ingest",
    status: "queued",
    connectionId: undefined,
    objectType: event.object_type,
    aspectType: event.aspect_type,
  });

  return { status: "persisted", eventId: created.id };
}

/**
 * Handler do GET de validação da subscription do Strava.
 *
 * Lê `hub.mode`/`hub.verify_token`/`hub.challenge` da query string, valida via
 * `verifyStravaWebhookChallenge` e responde 200 com `{ "hub.challenge": <valor> }`
 * quando válido; 403 caso contrário. Nunca ecoa/loga o verify token.
 */
export async function handleStravaWebhookGet(
  request: Request,
): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query: StravaWebhookChallengeQuery = Object.fromEntries(
    searchParams.entries(),
  );

  const result = verifyStravaWebhookChallenge(query);

  if (!result.ok) {
    logger.warn("Strava webhook challenge rejected", {
      provider: "STRAVA",
      operation: "webhook_challenge",
      status: "rejected",
      reason: result.reason,
    });
    return NextResponse.json(
      { error: "STRAVA_WEBHOOK_CHALLENGE_REJECTED" },
      { status: 403 },
    );
  }

  logger.info("Strava webhook challenge verified", {
    provider: "STRAVA",
    operation: "webhook_challenge",
    status: "verified",
  });

  // Corpo EXATO exigido pela doc oficial: eco do challenge em application/json.
  return NextResponse.json({ "hub.challenge": result.challenge }, { status: 200 });
}

/**
 * Handler do POST de evento do Strava.
 *
 * Lê e valida o corpo, persiste o evento (PENDING, dedupe-aware) e responde 200
 * rápido. Payload inválido (JSON malformado, corpo grande demais ou shape que
 * não passa no Zod) → 400. NUNCA processa síncronamente (Req 12.3/12b).
 *
 * Nota sobre o 400 x re-tentativa: o Strava re-tenta quando NÃO recebe 200.
 * Retornar 400 para um payload que nunca será processável (shape inválido) é
 * intencional — não queremos que o Strava insista em um evento malformado, e o
 * 400 sinaliza o problema sem vazar detalhes.
 */
export async function handleStravaWebhookPost(
  request: Request,
): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (!rawBody || rawBody.length > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const result = await ingestStravaWebhookEvent(json);

  if (result.status === "invalid") {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  // `persisted` e `duplicate` são ambos sucesso do ponto de vista do Strava:
  // respondemos 200 rápido para confirmar o recebimento.
  return NextResponse.json({ ok: true }, { status: 200 });
}
