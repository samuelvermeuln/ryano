/**
 * Barrel do cálculo compartilhado de zonas de frequência cardíaca
 * (provider-agnostic).
 *
 * Ponto de entrada único para qualquer provider com stream de FC (Strava hoje;
 * Polar, COROS, Suunto, Fitbit no futuro): o módulo do provider decide *se*
 * calcula as zonas, com base nas suas capabilities e no que o stream contém;
 * este core compartilhado só sabe fazer a conta. Nenhuma lógica específica de
 * provider entra aqui.
 *
 * _Requisitos: 2.7_
 */

export type { HeartRateSample } from "@/modules/shared/activities/heart-rate-zones/compute-heart-rate-zones-from-stream";

export {
  HEART_RATE_ZONE_COUNT,
  HEART_RATE_ZONE_LABELS,
  HEART_RATE_ZONE_PERCENT_BOUNDARIES,
  HEART_RATE_ZONES_SECTION_ID,
  computeHeartRateZonesFromStream,
} from "@/modules/shared/activities/heart-rate-zones/compute-heart-rate-zones-from-stream";

export type { MaxHeartRateReferenceInput } from "@/modules/shared/activities/heart-rate-zones/resolve-max-heart-rate-reference";

export { resolveMaxHeartRateReference } from "@/modules/shared/activities/heart-rate-zones/resolve-max-heart-rate-reference";
