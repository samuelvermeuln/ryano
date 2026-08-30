/**
 * Repositório: UPSERT idempotente de uma atividade do Strava na `Activity`.
 *
 * Concentra o upsert chaveado pelo unique `(provider, externalId, userId)`
 * (Req 6.6/11.6) usado tanto pelo sync/backfill (Task 6.4) quanto pelo processor
 * de webhook (Task 7.1). Reexecutar com o mesmo `externalId` NÃO duplica: cria
 * na primeira vez e atualiza nas seguintes.
 *
 * Recebe o shape já mapeado por `normalizedStravaActivityToActivityData`
 * (`StravaActivityUpsertData`) e adiciona as chaves contextuais da conexão
 * (`userId`, `wearableConnectionId`).
 *
 * _Requisitos: 11.6, 16.2, 12.5, 12.6_
 */

import { WearableProvider } from "@prisma/client";

import type { StravaActivityUpsertData } from "@/modules/strava/database/mappers/normalized-activity-to-activity";
import { prisma } from "@/server/db";

/** Resultado do upsert: se criou uma nova atividade ou atualizou existente. */
export interface UpsertStravaActivityResult {
  /** `true` se uma atividade nova foi criada; `false` se atualizou existente. */
  created: boolean;
}

/**
 * Faz o upsert idempotente de uma atividade do Strava. Idempotente por
 * `(provider, externalId, userId)`.
 */
export async function upsertStravaActivity(input: {
  userId: string;
  connectionId: string;
  activityData: StravaActivityUpsertData;
}): Promise<UpsertStravaActivityResult> {
  const { userId, connectionId, activityData } = input;

  const key = {
    provider_externalId_userId: {
      provider: WearableProvider.STRAVA,
      externalId: activityData.externalId,
      userId,
    },
  } as const;

  const existing = await prisma.activity.findUnique({
    where: key,
    select: { id: true },
  });

  await prisma.activity.upsert({
    where: key,
    update: { ...activityData, wearableConnectionId: connectionId, userId },
    create: { ...activityData, wearableConnectionId: connectionId, userId },
  });

  return { created: existing === null };
}
