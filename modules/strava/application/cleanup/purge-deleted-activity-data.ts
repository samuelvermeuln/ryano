/**
 * Purge dos dados locais de uma atividade EXCLUÍDA no Strava (Task 7.3).
 *
 * Acionado pelo processor de webhook quando chega um evento
 * `object_type=activity` + `aspect_type=delete`: o atleta apagou a atividade no
 * Strava, então a aplicação DEVE remover a cópia local correspondente
 * (Req 12.4, 17.4).
 *
 * O que é removido, escopado à identidade mínima do Strava:
 *   1. A linha em `Activity` chaveada pelo unique `(provider=STRAVA, externalId,
 *      userId)`. Só a atividade daquele usuário, e SOMENTE do provider STRAVA —
 *      o filtro por `provider` garante isolamento total de outros providers
 *      (Garmin etc.), mesmo que, por acaso, compartilhem um `externalId`.
 *   2. A linha correspondente em `StravaActivityCache`, chaveada por
 *      `(wearableConnectionId=connectionId, stravaActivityId=externalId)` — o
 *      cache de curta duração daquela atividade, se existir.
 *
 * Idempotência (Req 12.5, 12.6): usamos `deleteMany`, que remove 0..1 linhas e
 * NÃO lança quando nada casa. Reprocessar o mesmo evento de delete converge para
 * o mesmo estado (no-op na segunda vez). As duas remoções rodam numa transação
 * para não deixar a atividade removida mas o cache órfão (ou vice-versa).
 *
 * Isolamento entre providers: o delete de `Activity` filtra por
 * `provider=STRAVA` e `userId`; o delete de cache é uma tabela exclusiva do
 * Strava escopada por `wearableConnectionId`. Nenhuma linha de outro provider é
 * tocada.
 *
 * Segurança (Req 20.1/20.2): o log carrega apenas metadados seguros
 * (provider/operation/connectionId/counts) — nunca payloads, tokens ou PII.
 *
 * _Requisitos: 12.4, 17.4, 12.5, 12.6_
 */

import { WearableProvider } from "@prisma/client";

import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";

/** Parâmetros do purge de uma atividade excluída no Strava. */
export interface PurgeDeletedActivityDataInput {
  /** `externalId` da atividade no Strava (o `object_id` do evento de webhook). */
  externalId: string;
  /** Usuário dono da atividade (resolvido a partir do `owner_id`/athleteId). */
  userId: string;
  /** `WearableConnection` (STRAVA) do usuário — escopa o cache a remover. */
  connectionId: string;
}

/** Resultado do purge: quantas linhas foram removidas em cada tabela. */
export interface PurgeDeletedActivityDataResult {
  /** Linhas removidas de `Activity` (0 se já não existia). */
  deletedActivities: number;
  /** Linhas removidas de `StravaActivityCache` (0 se não havia cache). */
  deletedCacheEntries: number;
}

/**
 * Remove a atividade (e o cache) de uma atividade excluída no Strava.
 * Idempotente e restrito ao provider STRAVA.
 */
export async function purgeDeletedActivityData(
  input: PurgeDeletedActivityDataInput,
): Promise<PurgeDeletedActivityDataResult> {
  const { externalId, userId, connectionId } = input;

  const [deletedActivities, deletedCacheEntries] = await prisma.$transaction([
    prisma.activity.deleteMany({
      where: {
        provider: WearableProvider.STRAVA,
        externalId,
        userId,
      },
    }),
    prisma.stravaActivityCache.deleteMany({
      where: {
        wearableConnectionId: connectionId,
        stravaActivityId: externalId,
      },
    }),
  ]);

  logger.info("Strava deleted activity purged", {
    provider: "STRAVA",
    operation: "webhook_delete",
    status: "purged",
    connectionId,
    deletedActivities: deletedActivities.count,
    deletedCacheEntries: deletedCacheEntries.count,
  });

  return {
    deletedActivities: deletedActivities.count,
    deletedCacheEntries: deletedCacheEntries.count,
  };
}
