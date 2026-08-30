/**
 * Barrel dos DTOs remotos do Strava (forma "wire" da API v3).
 *
 * Camada `api/dto`: apenas tipos, derivados dos schemas Zod de `api/schemas` via
 * `z.infer` (abordagem schema-first, sem drift entre runtime e tipo estático).
 * DTO remoto NÃO atravessa direto para domínio/UI — passa por parser (Task 6.2)
 * que produz `NormalizedActivity` (Req 11.4).
 *
 * _Requisitos: 11.2, 11.3_
 */

export type {
  StravaAthleteDto,
  StravaSummaryGearDto,
} from "@/modules/strava/api/dto/strava-athlete";

export type {
  StravaDetailedActivityDto,
  StravaSummaryActivityDto,
} from "@/modules/strava/api/dto/strava-activity";

export type { StravaLapDto } from "@/modules/strava/api/dto/strava-lap";

export type {
  StravaBooleanStreamDto,
  StravaLatLngStreamDto,
  StravaNumberStreamDto,
  StravaStreamDto,
  StravaStreamSetDto,
  StravaStreamSetObjectDto,
} from "@/modules/strava/api/dto/strava-stream";

export type {
  StravaWebhookAspectType,
  StravaWebhookEventDto,
  StravaWebhookObjectType,
} from "@/modules/strava/api/dto/strava-webhook-event";

export type {
  StravaErrorDto,
  StravaFaultDto,
} from "@/modules/strava/api/dto/strava-fault";
