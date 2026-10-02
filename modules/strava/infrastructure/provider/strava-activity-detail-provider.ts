/**
 * SAM-39 — adapter `ActivityDetailProvider` do Strava para o `providerRegistry`
 * (contrato de SAM-45). Traduz o `ProviderContext` para o `StravaClientContext`
 * e delega a composição a `fetchStravaActivityDetail`, que reaproveita as laps
 * já persistidas e busca os streams. Como a composição precisa do payload
 * armazenado (polyline, lat/lng, tempos), a atividade é lida do banco pelo
 * `externalId` da conexão; sem linha persistida não há detalhe (`null`).
 */
import type { ProviderCapabilities } from "@/modules/shared/integrations/capabilities";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { ActivityDetailProvider, ProviderContext } from "@/modules/shared/integrations/contracts";
import type { ProviderAuthType } from "@/modules/shared/integrations/types";
import type { NormalizedActivityDetail } from "@/modules/shared/activities/contracts";
import { createStravaClient, type StravaClient } from "@/modules/strava/api/client";
import { fetchStravaActivityDetail } from "@/modules/strava/application/activities/strava-activity-detail-provider";
import { prisma } from "@/server/db";

function stravaBaseMeta(): { capabilities: ProviderCapabilities; authType: ProviderAuthType } {
  const definition = getProviderDefinition("STRAVA");
  return {
    capabilities: (definition?.capabilities ?? { activityDetails: true }) as ProviderCapabilities,
    authType: definition?.authType ?? "OAUTH2",
  };
}

export function createStravaActivityDetailProvider(
  client: StravaClient = createStravaClient(),
  db: Pick<typeof prisma, "activity"> = prisma,
): ActivityDetailProvider {
  const { capabilities, authType } = stravaBaseMeta();
  return {
    id: "STRAVA",
    capabilities,
    authType,
    async getActivityDetail(ctx: ProviderContext, externalId: string): Promise<NormalizedActivityDetail | null> {
      const activity = await db.activity.findUnique({
        where: { provider_externalId_userId: { provider: "STRAVA", externalId, userId: ctx.userId } },
        select: { externalId: true, rawPayload: true, metrics: true },
      });
      if (!activity) return null;
      return fetchStravaActivityDetail(client, { connectionId: ctx.connectionId, userId: ctx.userId }, activity);
    },
  };
}
