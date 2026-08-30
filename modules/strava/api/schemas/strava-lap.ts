/**
 * Schema Zod de uma volta (`Lap`) de atividade do Strava.
 *
 * Retornado por `GET /activities/{id}/laps` (client `getActivityLaps`, Task 6)
 * e embutido em `DetailedActivity.laps`. Só `id` é exigido; métricas dependentes
 * de sensores (`average_watts`, `average_cadence`, `device_watts`) são
 * opcionais/nulas quando a atividade não as possui.
 *
 * Campos confirmados na documentação oficial vigente
 * ([Strava API Reference](https://developers.strava.com/docs/reference/), amostra
 * de `getLapsByActivityId`): `id`, `resource_state`, `name`, `activity` (meta),
 * `athlete` (meta), `elapsed_time`, `moving_time`, `start_date`,
 * `start_date_local`, `distance`, `start_index`, `end_index`,
 * `total_elevation_gain`, `average_speed`, `max_speed`, `average_cadence`,
 * `device_watts`, `average_watts`, `average_heartrate`, `max_heartrate`,
 * `lap_index`, `split`, `pace_zone`.
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * _Requisitos: 11.2, 11.3_
 */

import { z } from "zod";

import {
  stravaMetaActivitySchema,
  stravaMetaAthleteSchema,
} from "@/modules/strava/api/schemas/strava-common";

/** Volta (lap) de uma atividade do Strava. */
export const stravaLapSchema = z
  .object({
    id: z.number().int(),
    resource_state: z.number().int().optional(),
    name: z.string().nullish(),
    activity: stravaMetaActivitySchema.optional(),
    athlete: stravaMetaAthleteSchema.optional(),
    elapsed_time: z.number().int().nullish(),
    moving_time: z.number().int().nullish(),
    start_date: z.string().nullish(),
    start_date_local: z.string().nullish(),
    distance: z.number().nullish(),
    start_index: z.number().int().nullish(),
    end_index: z.number().int().nullish(),
    total_elevation_gain: z.number().nullish(),
    average_speed: z.number().nullish(),
    max_speed: z.number().nullish(),
    average_cadence: z.number().nullish(),
    device_watts: z.boolean().nullish(),
    average_watts: z.number().nullish(),
    average_heartrate: z.number().nullish(),
    max_heartrate: z.number().nullish(),
    lap_index: z.number().int().nullish(),
    split: z.number().int().nullish(),
    pace_zone: z.number().int().nullish(),
  })
  .passthrough();

/** Lista de voltas (resposta de `GET /activities/{id}/laps`). */
export const stravaLapListSchema = z.array(stravaLapSchema);
