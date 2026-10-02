/**
 * Registry de providers e seleção dinâmica de fontes de atividade.
 *
 * O core opera sobre as conexões de um usuário via este registry
 * (`ProviderId -> ProviderModule`), nunca referenciando `garminProvider`/
 * `stravaProvider` diretamente. Adicionar um novo provider é registrá-lo aqui —
 * sem alterar o código dos módulos já existentes.
 *
 * O import do catálogo abaixo é intencional: ele ativa, como efeito colateral, o
 * registro do resolver de capabilities do core (`setProviderCapabilitiesResolver`),
 * garantindo que `hasCapability`/`getUserCapabilities` funcionem sempre que o
 * registry for carregado.
 *
 * _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5_
 */

import { prisma } from "@/server/db";
// Efeito colateral: registra o resolver de capabilities do catálogo.
import "@/modules/shared/integrations/catalog";
import type { ProviderModule } from "@/modules/shared/integrations/contracts";
import type { ProviderId } from "@/modules/shared/integrations/types";
import { garminModule } from "@/modules/garmin/infrastructure/provider/garmin-module";
import { stravaModule } from "@/modules/strava";

/**
 * Mapa `ProviderId -> módulo do provider`.
 *
 * STRAVA: `activity` + `webhook` (6.x/7.x) + `activityDetail` (SAM-39).
 * GARMIN (SAM-42): `activity`, `activityDetail` e `dailyHealth`, fechando o
 * que o catálogo declara (`registry/capability-contract.test.ts`). `Partial`
 * porque nem todo `ProviderId` do catálogo tem módulo implementado (ex.:
 * `COMING_SOON`).
 */
export const providerRegistry: Partial<Record<ProviderId, ProviderModule>> = {
  GARMIN: garminModule,
  STRAVA: stravaModule,
};

/**
 * Retorna o módulo registrado para um provider, ou `undefined` se não houver.
 */
export function getProviderModule(
  providerId: ProviderId,
): ProviderModule | undefined {
  return providerRegistry[providerId];
}

/**
 * Fonte de atividade de um usuário: um provider conectado cujo módulo fornece
 * atividades, associado à conexão específica.
 */
export interface UserActivitySource {
  provider: ProviderId;
  connectionId: string;
}

/**
 * Retorna as fontes de atividade de um usuário.
 *
 * Carrega as conexões conectadas do usuário e as cruza com o registry: só entra
 * na lista o provider cujo módulo está registrado e expõe o contrato de
 * atividades (`ProviderModule.activity`). Assim o core itera fontes reais sem
 * hardcodar providers — enquanto o registry estiver vazio, o resultado é `[]`.
 *
 * A `WearableConnection.provider` (enum Prisma `WearableProvider`) é comparada
 * com as chaves do registry; providers presentes no enum mas ausentes do
 * registry (ou sem capability de atividade) são ignorados.
 *
 * _Requisitos: 4.2, 4.3_
 */
export async function getUserActivitySources(
  userId: string,
): Promise<UserActivitySource[]> {
  const connections = await prisma.wearableConnection.findMany({
    where: { userId, status: "CONNECTED" },
    select: { id: true, provider: true },
  });

  const sources: UserActivitySource[] = [];

  for (const connection of connections) {
    // O enum Prisma e `ProviderId` compartilham os identificadores; a checagem
    // no registry descarta valores sem módulo (ex.: APPLE) de forma segura.
    const providerId = connection.provider as ProviderId;
    const providerModule = providerRegistry[providerId];

    if (!providerModule?.activity) {
      continue;
    }

    sources.push({ provider: providerId, connectionId: connection.id });
  }

  return sources;
}
