/**
 * Registry provider-agnostic de enriquecedores do detalhe de atividade.
 *
 * O core de apresentação (`get-activity-visual-data.ts`) não sabe quais
 * providers existem: ele apenas pergunta ao registry se há um enriquecedor
 * registrado para o `ProviderId` da atividade. Adicionar um provider novo é
 * adicionar **uma entrada** aqui — nenhuma entrada existente é tocada e nenhum
 * consumidor muda (Requisito 1.4).
 *
 * Duas regras estruturais sustentam esse desacoplamento:
 *
 * 1. **Nada de import estático de módulo de provider.** Cada entrada é uma
 *    *fábrica* (`() => Promise<ActivityDetailEnricher>`) que faz `import()`
 *    dentro do corpo. Isso preserva o carregamento tardio já usado hoje e evita
 *    o ciclo `shared -> garmin -> shared` (o mesmo motivo documentado no
 *    dispatcher).
 * 2. **Nada de comparação por identidade de provider.** Este módulo é uma
 *    tabela de lookup; a decisão de *se* enriquecer continua sendo tomada por
 *    capability (`hasCapability(providerId, "activityDetails")`) no dispatcher
 *    (Requisitos 1.1, 7.1).
 *
 * Providers sem módulo de enriquecimento (POLAR/COROS/SUUNTO/FITBIT hoje)
 * simplesmente não têm entrada: `getActivityDetailEnricherLoader` devolve
 * `undefined` e o dispatcher cai na visão base normalizada (Requisito 1.3).
 *
 * _Requisitos: 1.1, 1.2, 1.4, 7.1, 7.2_
 */

import type { Activity } from "@prisma/client";

import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";
import type { ProviderId } from "@/modules/shared/integrations/types";

/**
 * Assinatura de um enriquecedor de detalhe de atividade de um provider.
 *
 * Retorna `null` quando o provider não tem dado rico para a atividade (ou o
 * dado não é suficiente para superar a visão base). Lançar exceção também é
 * tolerado: o dispatcher trata falha como ausência de dado (Requisito 7.3).
 */
export type ActivityDetailEnricher = (
  activity: Activity,
) => Promise<ActivityVisualData | null>;

/**
 * Fábrica que carrega o enriquecedor de um provider por dynamic import.
 *
 * Pode rejeitar (módulo ausente, export ainda não disponível): quem chama
 * precisa tratar a rejeição como "sem enriquecimento".
 */
export type ActivityDetailEnricherLoader = () => Promise<ActivityDetailEnricher>;

/**
 * Registry `ProviderId -> loader do enriquecedor`.
 *
 * `Partial` é intencional: a ausência de um provider aqui é o estado normal de
 * um provider sem módulo de enriquecimento, não um erro.
 */
export const ACTIVITY_DETAIL_ENRICHER_LOADERS: Partial<
  Record<ProviderId, ActivityDetailEnricherLoader>
> = {
  GARMIN: async () =>
    (await import("@/modules/garmin")).getGarminActivityVisualData,
  STRAVA: async () =>
    (await import("@/modules/strava")).getStravaActivityVisualData,
};

/**
 * Resolve o loader do enriquecedor de um provider, ou `undefined` quando o
 * provider não tem enriquecedor registrado.
 *
 * Lookup puro: não carrega o módulo do provider e nunca lança.
 */
export function getActivityDetailEnricherLoader(
  providerId: ProviderId,
): ActivityDetailEnricherLoader | undefined {
  return ACTIVITY_DETAIL_ENRICHER_LOADERS[providerId];
}
