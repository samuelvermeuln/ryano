/**
 * Adapter `ActivityProvider` do Strava para o `providerRegistry` do core
 * (Task 6.4).
 *
 * Liga a capability de atividades do Strava ao contrato genérico
 * `ActivityProvider` do core, de modo que `getUserActivitySources` passe a
 * incluir STRAVA e o core itere as atividades do Strava sem hardcode. Traduz o
 * `ProviderContext` genérico (userId/connectionId/secrets) para o
 * `StravaClientContext` e os filtros `ListActivitiesInput` para os parâmetros de
 * `GET /athlete/activities` (`after`/`before` em epoch de SEGUNDOS, `page`/
 * `per_page`). Cada DTO remoto é normalizado por `parseStravaActivity` — o DTO
 * nunca atravessa direto para o domínio/UI (Req 11.4).
 *
 * A listagem NÃO persiste nada: persistência é responsabilidade do sync
 * (`syncStravaForUser`), que aplica o Policy Gate. Este adapter é apenas a
 * superfície de leitura provider-agnostic exigida pelo registry (Req 4.2/4.3).
 *
 * _Requisitos: 4.1, 4.2, 4.3, 11.4_
 */

import type { ProviderCapabilities } from "@/modules/shared/integrations/capabilities";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type {
  ActivityProvider,
  ListActivitiesInput,
  NormalizedActivity,
  ProviderContext,
} from "@/modules/shared/integrations/contracts";
import type { ProviderAuthType } from "@/modules/shared/integrations/types";
import { createStravaClient, type StravaClient } from "@/modules/strava/api/client";
import { parseStravaActivity } from "@/modules/strava/parsers/parse-strava-activity";

/** Capabilities/authType declarados no catálogo (fallback defensivo). */
function stravaBaseMeta(): {
  capabilities: ProviderCapabilities;
  authType: ProviderAuthType;
} {
  const definition = getProviderDefinition("STRAVA");
  return {
    capabilities: (definition?.capabilities ?? { activities: true }) as ProviderCapabilities,
    authType: definition?.authType ?? "OAUTH2",
  };
}

/** Converte segundos-epoch a partir de uma `Date`, tolerando ausência. */
function toEpochSeconds(date: Date | undefined): number | undefined {
  return date ? Math.floor(date.getTime() / 1000) : undefined;
}

/**
 * Constrói o `ActivityProvider` do Strava. O `StravaClient` é injetável para
 * testes; por padrão usa `createStravaClient()`.
 */
export function createStravaActivityProvider(
  client: StravaClient = createStravaClient(),
): ActivityProvider {
  const { capabilities, authType } = stravaBaseMeta();

  return {
    id: "STRAVA",
    capabilities,
    authType,

    async listActivities(
      ctx: ProviderContext,
      input: ListActivitiesInput,
    ): Promise<NormalizedActivity[]> {
      const summaries = await client.listAthleteActivities(
        { connectionId: ctx.connectionId, userId: ctx.userId },
        {
          after: toEpochSeconds(input.since),
          before: toEpochSeconds(input.until),
          page: input.page,
          perPage: input.limit,
        },
      );

      return summaries.map((summary) => parseStravaActivity(summary));
    },

    async getActivity(
      ctx: ProviderContext,
      externalId: string,
    ): Promise<NormalizedActivity | null> {
      const detailed = await client.getActivityById(
        { connectionId: ctx.connectionId, userId: ctx.userId },
        externalId,
      );

      return parseStravaActivity(detailed);
    },
  };
}
