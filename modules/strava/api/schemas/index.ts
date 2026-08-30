/**
 * Barrel dos schemas Zod de validação runtime dos DTOs remotos do Strava.
 *
 * Camada `api/schemas`: valida o "wire shape" do Strava (Req 11.3) antes de
 * qualquer conversão. Abordagem schema-first — os tipos em `api/dto` são
 * derivados destes schemas via `z.infer` (ver `api/dto/index.ts`).
 *
 * O schema de resposta de token (`strava-token-response.ts`, Task 5.3) é
 * mantido e reexportado aqui sem alteração.
 *
 * _Requisitos: 11.2, 11.3_
 */

export {
  stravaLatLngSchema,
  stravaMetaActivitySchema,
  stravaMetaAthleteSchema,
  stravaPolylineMapSchema,
  stravaSeriesTypeSchema,
  stravaSplitSchema,
  stravaStreamResolutionSchema,
} from "@/modules/strava/api/schemas/strava-common";

export {
  stravaAthleteSchema,
  stravaSummaryGearSchema,
} from "@/modules/strava/api/schemas/strava-athlete";

export {
  stravaDetailedActivitySchema,
  stravaSummaryActivityListSchema,
  stravaSummaryActivitySchema,
} from "@/modules/strava/api/schemas/strava-activity";

export {
  stravaLapListSchema,
  stravaLapSchema,
} from "@/modules/strava/api/schemas/strava-lap";

export {
  stravaBooleanStreamSchema,
  stravaLatLngStreamSchema,
  stravaNumberStreamSchema,
  stravaStreamSchema,
  stravaStreamSetArraySchema,
  stravaStreamSetObjectSchema,
  stravaStreamSetSchema,
} from "@/modules/strava/api/schemas/strava-stream";

export {
  stravaWebhookAspectTypeSchema,
  stravaWebhookEventSchema,
  stravaWebhookObjectTypeSchema,
} from "@/modules/strava/api/schemas/strava-webhook-event";

export {
  stravaErrorSchema,
  stravaFaultSchema,
} from "@/modules/strava/api/schemas/strava-fault";

// Token OAuth (Task 5.3) — mantido; reexportado para superfície única.
export {
  stravaTokenAthleteSchema,
  stravaTokenResponseSchema,
} from "@/modules/strava/api/schemas/strava-token-response";
export type { StravaTokenResponse } from "@/modules/strava/api/schemas/strava-token-response";
