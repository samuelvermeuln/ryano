/**
 * Barrel de application/activities do módulo Strava (Tarefa 17.6).
 *
 * Ponto de entrada do enriquecimento de detalhe de atividade do Strava: é por
 * aqui que `modules/strava/index.ts` (Tarefa 19.1) reexporta
 * `getStravaActivityVisualData`, que o registry de enriquecimento resolve por
 * capability — nunca por identidade de provider (Requisito 1.2).
 *
 * Estruturalmente paralelo a
 * `modules/garmin/application/activities/index.ts`. O cache em memória
 * (`stravaActivityVisualCache`) NÃO é reexportado: é `@internal`, um seam de
 * teste, e não superfície pública — os testes o importam direto do arquivo de
 * implementação, como já ocorre no lado Garmin.
 *
 * _Requisitos: 1.2_
 */

export { getStravaActivityVisualData } from "@/modules/strava/application/activities/strava-activity-details";
export type { GetStravaActivityVisualDataOptions } from "@/modules/strava/application/activities/strava-activity-details";

export {
  STRAVA_ACTIVITY_VISUAL_CACHE_TTL_MS,
  STRAVA_DETAIL_STREAM_KEYS,
  STRAVA_HEART_RATE_ZONES_DISCLAIMER,
  STRAVA_SPLITS_SECTION_ID,
  STRAVA_WORKOUT_ANALYSIS_SECTION_ID,
} from "@/modules/strava/application/activities/strava-activity-details";
