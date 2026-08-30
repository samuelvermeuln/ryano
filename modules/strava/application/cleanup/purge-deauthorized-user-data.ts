/**
 * Purge dos dados do Strava de um usuário que DESAUTORIZOU o app (Task 7.3).
 *
 * Acionado pelo processor de webhook quando chega um evento
 * `object_type=athlete` com `updates.authorized="false"`: o próprio atleta
 * removeu o Ryvano da conta Strava. Nesse caso a aplicação DEVE apagar a
 * "pegada" local do Strava daquele usuário (Req 17.3) — sem afetar nenhum outro
 * provider (Req 3.6).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DECISÃO — apagar (ou não) as `Activity` importadas na desautorização:
 *
 * Optamos por APAGAR as atividades importadas do Strava (`provider=STRAVA`,
 * `userId`). Justificativa:
 *   - Req 17.3 trata desautorização como "purge dos dados do usuário"; e a
 *     política da própria Strava exige remover os dados do atleta ao ser
 *     desautorizado. Manter as atividades importadas seria reter dados do Strava
 *     sem autorização vigente.
 *   - Diferente do disconnect iniciado pelo usuário DENTRO do Ryvano (Task 5.4,
 *     `revokeStravaConnection`, que só limpa credenciais/detalhes e marca a
 *     conexão desconectada, preservando o histórico), a desautorização parte da
 *     Strava e sinaliza revogação de consentimento — daí o purge mais amplo.
 *
 * Escopo do purge, tudo numa ÚNICA transação (atomicidade):
 *   1. `WearableSecret` da conexão (access/refresh tokens do Strava).
 *   2. `StravaConnectionDetails` da conexão (athleteId/scopes/expiração).
 *   3. `StravaActivityCache` da conexão (cache de curta duração).
 *   4. `Activity` do usuário com `provider=STRAVA` (atividades importadas).
 *   5. `WearableConnection` marcada como DISCONNECTED, com `externalAccountId`
 *      zerado (espelha a limpeza local de `revokeStravaConnection`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Alinhamento com `revokeStravaConnection` (Task 5.4): a limpeza de
 * secrets/detalhes e a marcação DISCONNECTED seguem os MESMOS campos, mantendo o
 * estado local coerente entre os dois caminhos. A diferença intencional:
 *   - NÃO chamamos o endpoint remoto de deauthorize/revoke — a Strava JÁ
 *     iniciou a desautorização; refazer a chamada seria redundante.
 *   - ADICIONAMOS o purge de `StravaActivityCache` e das `Activity` importadas,
 *     conforme a decisão acima.
 *
 * Isolamento entre providers (Req 3.6): TODAS as remoções são escopadas por
 * `wearableConnectionId`/`connectionId` ou por `provider=STRAVA` + `userId`.
 * Conexões, secrets, detalhes e atividades de outros providers do mesmo usuário
 * permanecem intactos.
 *
 * Idempotência (Req 12.5, 12.6): `deleteMany`/`updateMany` removem 0..N linhas
 * sem lançar. Reprocessar a mesma desautorização é no-op na segunda vez.
 *
 * Segurança (Req 20.1/20.2): o log carrega apenas metadados seguros — nunca
 * tokens, payloads ou PII.
 *
 * _Requisitos: 17.3, 3.6, 12.5, 12.6, 20.1, 20.2_
 */

import { WearableProvider } from "@prisma/client";

import { prisma } from "@/server/db";
import { logger } from "@/server/logging/logger";

/** Parâmetros do purge de um usuário desautorizado. */
export interface PurgeDeauthorizedUserDataInput {
  /** Usuário que desautorizou o app (resolvido pelo `owner_id`/athleteId). */
  userId: string;
  /** `WearableConnection` (STRAVA) do usuário a ser limpa. */
  connectionId: string;
}

/** Resultado do purge: contagens por tabela afetada. */
export interface PurgeDeauthorizedUserDataResult {
  deletedSecrets: number;
  deletedConnectionDetails: number;
  deletedCacheEntries: number;
  deletedActivities: number;
}

/**
 * Apaga a pegada local do Strava de um usuário desautorizado e marca a conexão
 * como desconectada. Transacional, idempotente e restrito ao provider STRAVA.
 */
export async function purgeDeauthorizedUserData(
  input: PurgeDeauthorizedUserDataInput,
): Promise<PurgeDeauthorizedUserDataResult> {
  const { userId, connectionId } = input;

  const result = await prisma.$transaction(async (tx) => {
    const deletedSecrets = await tx.wearableSecret.deleteMany({
      where: { wearableConnectionId: connectionId },
    });

    const deletedConnectionDetails = await tx.stravaConnectionDetails.deleteMany(
      { where: { wearableConnectionId: connectionId } },
    );

    const deletedCacheEntries = await tx.stravaActivityCache.deleteMany({
      where: { wearableConnectionId: connectionId },
    });

    // Purge das atividades importadas: escopado por provider=STRAVA + userId,
    // garantindo que nenhuma atividade de outro provider seja removida.
    const deletedActivities = await tx.activity.deleteMany({
      where: { provider: WearableProvider.STRAVA, userId },
    });

    // Espelha a limpeza local de `revokeStravaConnection` (mesmos campos).
    await tx.wearableConnection.update({
      where: { id: connectionId },
      data: {
        status: "DISCONNECTED",
        lastSyncStatus: "DISCONNECTED",
        lastErrorCode: null,
        externalAccountId: null,
        lastEventAt: new Date(),
      },
    });

    return {
      deletedSecrets: deletedSecrets.count,
      deletedConnectionDetails: deletedConnectionDetails.count,
      deletedCacheEntries: deletedCacheEntries.count,
      deletedActivities: deletedActivities.count,
    };
  });

  logger.info("Strava deauthorized user data purged", {
    provider: "STRAVA",
    operation: "webhook_deauthorization",
    status: "purged",
    connectionId,
    ...result,
  });

  return result;
}
