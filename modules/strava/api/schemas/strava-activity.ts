/**
 * Schemas Zod das atividades do Strava: `SummaryActivity` e `DetailedActivity`.
 *
 * `stravaSummaryActivitySchema` valida os itens de `GET /athlete/activities`
 * (listagem/backfill, Task 6.4). `stravaDetailedActivitySchema` valida
 * `GET /activities/{id}` (detalhe pós-webhook, Task 7) e estende o resumo com
 * campos extras (descrição, calorias, splits, laps, esforços de segmento).
 *
 * Só `id` e `start_date` são tratados como base necessária para normalização; as
 * métricas de sensores são todas opcionais/nulas (Req: campo opcional ausente
 * não pode quebrar). Atividades manuais podem não ter `map`, HR ou potência.
 *
 * Campos confirmados na documentação oficial vigente
 * ([Strava API Reference](https://developers.strava.com/docs/reference/), amostras
 * de `SummaryActivity`/`DetailedActivity`): identidade (`id`, `external_id`,
 * `upload_id`, `athlete`), nome/tipo (`name`, `type`, `sport_type`,
 * `workout_type`), tempos/distância (`distance`, `moving_time`, `elapsed_time`,
 * `total_elevation_gain`), datas (`start_date`, `start_date_local`, `timezone`,
 * `utc_offset`), contadores (`achievement_count`, `kudos_count`,
 * `comment_count`, `athlete_count`, `photo_count`, `total_photo_count`,
 * `pr_count`), velocidade/cadência/potência/HR (`average_speed`, `max_speed`,
 * `average_cadence`, `average_watts`, `weighted_average_watts`, `max_watts`,
 * `kilojoules`, `device_watts`, `has_heartrate`, `average_heartrate`,
 * `max_heartrate`), elevação (`elev_high`, `elev_low`), geo (`start_latlng`,
 * `end_latlng`, `map`), flags (`trainer`, `commute`, `manual`, `private`,
 * `flagged`, `from_accepted_tag`, `has_kudoed`), `gear_id`. `DetailedActivity`
 * acrescenta `description`, `calories`, `device_name`, `segment_efforts`,
 * `splits_metric`, `splits_standard`, `laps`, `best_efforts`, `gear`, `photos`.
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * _Requisitos: 11.2, 11.3_
 */

import { z } from "zod";

import {
  stravaLatLngSchema,
  stravaMetaAthleteSchema,
  stravaPolylineMapSchema,
  stravaSplitSchema,
} from "@/modules/strava/api/schemas/strava-common";
import { stravaLapSchema } from "@/modules/strava/api/schemas/strava-lap";

/**
 * Campos comuns a `SummaryActivity` e `DetailedActivity`.
 *
 * Extraídos para um objeto reutilizável de forma que o schema detalhado apenas
 * acrescente seus campos extras (`.extend(...)`), evitando duplicação e drift.
 */
const stravaActivityBaseShape = {
  id: z.number().int(),
  resource_state: z.number().int().optional(),
  external_id: z.string().nullish(),
  upload_id: z.number().int().nullish(),
  upload_id_str: z.string().nullish(),
  athlete: stravaMetaAthleteSchema.optional(),
  name: z.string().nullish(),
  distance: z.number().nullish(),
  moving_time: z.number().int().nullish(),
  elapsed_time: z.number().int().nullish(),
  total_elevation_gain: z.number().nullish(),
  // `type` é legado; `sport_type` é o campo canônico do Strava atual.
  type: z.string().nullish(),
  sport_type: z.string().nullish(),
  workout_type: z.number().int().nullish(),
  start_date: z.string(),
  start_date_local: z.string().nullish(),
  timezone: z.string().nullish(),
  utc_offset: z.number().nullish(),
  location_city: z.string().nullish(),
  location_state: z.string().nullish(),
  location_country: z.string().nullish(),
  achievement_count: z.number().int().nullish(),
  kudos_count: z.number().int().nullish(),
  comment_count: z.number().int().nullish(),
  athlete_count: z.number().int().nullish(),
  photo_count: z.number().int().nullish(),
  total_photo_count: z.number().int().nullish(),
  map: stravaPolylineMapSchema.optional(),
  trainer: z.boolean().nullish(),
  commute: z.boolean().nullish(),
  manual: z.boolean().nullish(),
  private: z.boolean().nullish(),
  flagged: z.boolean().nullish(),
  gear_id: z.string().nullish(),
  from_accepted_tag: z.boolean().nullish(),
  average_speed: z.number().nullish(),
  max_speed: z.number().nullish(),
  average_cadence: z.number().nullish(),
  average_temp: z.number().nullish(),
  average_watts: z.number().nullish(),
  weighted_average_watts: z.number().nullish(),
  kilojoules: z.number().nullish(),
  device_watts: z.boolean().nullish(),
  has_heartrate: z.boolean().nullish(),
  average_heartrate: z.number().nullish(),
  max_heartrate: z.number().nullish(),
  max_watts: z.number().nullish(),
  elev_high: z.number().nullish(),
  elev_low: z.number().nullish(),
  pr_count: z.number().int().nullish(),
  has_kudoed: z.boolean().nullish(),
  suffer_score: z.number().nullish(),
  start_latlng: stravaLatLngSchema.nullish(),
  end_latlng: stravaLatLngSchema.nullish(),
} as const;

/** Representação-resumo de atividade (itens de listagem). */
export const stravaSummaryActivitySchema = z
  .object(stravaActivityBaseShape)
  .passthrough();

/**
 * Representação detalhada de atividade (`GET /activities/{id}`).
 *
 * Estende o resumo com campos ricos. Coleções pesadas/variáveis
 * (`segment_efforts`, `best_efforts`, `photos`, `gear`) são mantidas tolerantes
 * (`z.unknown()`/`passthrough`) porque não são consumidas pela normalização.
 */
export const stravaDetailedActivitySchema = z
  .object({
    ...stravaActivityBaseShape,
    description: z.string().nullish(),
    calories: z.number().nullish(),
    device_name: z.string().nullish(),
    embed_token: z.string().nullish(),
    segment_efforts: z.array(z.unknown()).optional(),
    best_efforts: z.array(z.unknown()).optional(),
    splits_metric: z.array(stravaSplitSchema).optional(),
    splits_standard: z.array(stravaSplitSchema).optional(),
    laps: z.array(stravaLapSchema).optional(),
    gear: z.unknown().optional(),
    photos: z.unknown().optional(),
  })
  .passthrough();

/** Lista de atividades-resumo (resposta de `GET /athlete/activities`). */
export const stravaSummaryActivityListSchema = z.array(
  stravaSummaryActivitySchema,
);
