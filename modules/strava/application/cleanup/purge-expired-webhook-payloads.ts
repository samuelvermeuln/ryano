/**
 * Purge de TTL dos payloads de webhook do Strava (Task 8).
 *
 * Remove as linhas de `StravaWebhookEvent` cujo `expiresAt` já passou. Os
 * eventos de webhook são TRANSITÓRIOS, não histórico permanente (Req 17.1): a
 * rota persiste `StravaWebhookEvent(PENDING)` com um `expiresAt` calculado a
 * partir da política de retenção do Strava (`getProviderPolicy("STRAVA").
 * maxCacheAgeSeconds`, ver `webhooks/handler.ts`), o processor os marca
 * PROCESSED/FAILED, e esta rotina de retenção os apaga quando expiram.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DECISÃO — o que é elegível ao purge:
 *
 * Apagamos QUALQUER evento com `expiresAt < now`, independente do
 * `processingStatus`. Justificativa:
 *   - O `expiresAt` já embute a política de retenção; um evento expirado não
 *     deve ser retido, mesmo que ainda esteja PENDING (nesse ponto ele é lixo
 *     antigo que o job não conseguiu processar dentro da janela de retenção).
 *   - O efeito de negócio (upsert/purge da atividade) já foi aplicado para os
 *     PROCESSED; o registro do evento em si é só rastro operacional transitório.
 *
 * Idempotência (Req 17.5): `deleteMany` remove 0..N linhas e NUNCA lança quando
 * nada casa. Reexecutar converge para o mesmo estado. O relógio é injetável
 * (`now`) para testes determinísticos.
 *
 * Isolamento entre providers (Req 3.6): `StravaWebhookEvent` é uma tabela
 * EXCLUSIVA do Strava — nenhuma linha de outro provider é tocada.
 *
 * Segurança (Req 20.1/20.2): o log carrega apenas metadados seguros
 * (provider/operation/count) — nunca payloads, tokens ou PII.
 *
 * _Requisitos: 17.1, 17.2, 17.5_
 */

import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";

/** Parâmetros do purge de payloads de webhook expirados. */
export interface PurgeExpiredWebhookPayloadsInput {
  /** Relógio injetável (default `() => new Date()`), para testes. */
  now?: () => Date;
}

/** Resultado do purge: quantos eventos de webhook foram removidos. */
export interface PurgeExpiredWebhookPayloadsResult {
  /** Linhas removidas de `StravaWebhookEvent` (0 se nada expirou). */
  deletedWebhookEvents: number;
}

/**
 * Remove do `StravaWebhookEvent` os eventos expirados (`expiresAt < now`),
 * qualquer que seja o `processingStatus`. Idempotente e restrito ao Strava.
 */
export async function purgeExpiredWebhookPayloads(
  input: PurgeExpiredWebhookPayloadsInput = {},
): Promise<PurgeExpiredWebhookPayloadsResult> {
  const now = input.now ? input.now() : new Date();

  const deleted = await prisma.stravaWebhookEvent.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  logger.info("Strava expired webhook payloads purged", {
    provider: "STRAVA",
    operation: "retention_webhook",
    status: "purged",
    deletedWebhookEvents: deleted.count,
  });

  return { deletedWebhookEvents: deleted.count };
}
