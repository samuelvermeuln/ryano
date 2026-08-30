/**
 * Schemas Zod dos streams de atividade do Strava e do `StreamSet`.
 *
 * Retornado por `GET /activities/{id}/streams` (client opcional
 * `getActivityStreams`, Task 6). O client sempre envia `key_by_type=true`
 * (parâmetro que "deve ser true" na doc), então a resposta canônica é um objeto
 * indexado por tipo de stream. Ainda assim, para robustez, `stravaStreamSetSchema`
 * também aceita a forma de array (retornada quando `key_by_type` não é usado).
 *
 * Campos confirmados na documentação oficial vigente
 * ([Strava API Reference](https://developers.strava.com/docs/reference/), amostra
 * de `getActivityStreams`): cada stream tem `type`, `data`, `series_type`,
 * `original_size` e `resolution`. Tipos de stream disponíveis: `time`,
 * `distance`, `latlng`, `altitude`, `velocity_smooth`, `heartrate`, `cadence`,
 * `watts`, `temp`, `moving`, `grade_smooth`. O eixo (`series_type`) é
 * `"distance"` ou `"time"`; a `resolution` é `"low" | "medium" | "high"`.
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * _Requisitos: 11.2, 11.3_
 */

import { z } from "zod";

import {
  stravaLatLngSchema,
  stravaSeriesTypeSchema,
  stravaStreamResolutionSchema,
} from "@/modules/strava/api/schemas/strava-common";

/** Metadados comuns a todos os streams. */
const stravaStreamMetaShape = {
  type: z.string().nullish(),
  series_type: stravaSeriesTypeSchema.nullish(),
  original_size: z.number().int().nullish(),
  resolution: stravaStreamResolutionSchema.nullish(),
} as const;

/**
 * Stream genérico (usado na forma de array e como fallback). `data` é tolerante
 * (`z.unknown()`) porque o formato varia por tipo (números, booleanos, pares
 * `[lat,lng]`).
 */
export const stravaStreamSchema = z
  .object({
    ...stravaStreamMetaShape,
    data: z.array(z.unknown()),
  })
  .passthrough();

/** Stream de valores numéricos (time/distance/altitude/velocity/HR/cadence/watts/temp/grade). */
export const stravaNumberStreamSchema = z
  .object({ ...stravaStreamMetaShape, data: z.array(z.number()) })
  .passthrough();

/** Stream de coordenadas (`latlng`): lista de pares `[lat, lng]`. */
export const stravaLatLngStreamSchema = z
  .object({ ...stravaStreamMetaShape, data: z.array(stravaLatLngSchema) })
  .passthrough();

/** Stream booleano (`moving`). */
export const stravaBooleanStreamSchema = z
  .object({ ...stravaStreamMetaShape, data: z.array(z.boolean()) })
  .passthrough();

/**
 * `StreamSet` na forma indexada por tipo (resposta com `key_by_type=true`).
 * Todos os streams são opcionais: o conjunto retornado depende dos `keys`
 * pedidos e do que a atividade possui.
 */
export const stravaStreamSetObjectSchema = z
  .object({
    time: stravaNumberStreamSchema.optional(),
    distance: stravaNumberStreamSchema.optional(),
    latlng: stravaLatLngStreamSchema.optional(),
    altitude: stravaNumberStreamSchema.optional(),
    velocity_smooth: stravaNumberStreamSchema.optional(),
    heartrate: stravaNumberStreamSchema.optional(),
    cadence: stravaNumberStreamSchema.optional(),
    watts: stravaNumberStreamSchema.optional(),
    temp: stravaNumberStreamSchema.optional(),
    moving: stravaBooleanStreamSchema.optional(),
    grade_smooth: stravaNumberStreamSchema.optional(),
  })
  .passthrough();

/** `StreamSet` na forma de array (quando `key_by_type` não é usado). */
export const stravaStreamSetArraySchema = z.array(stravaStreamSchema);

/**
 * `StreamSet` tolerante: aceita tanto o objeto indexado por tipo quanto o array
 * de streams, cobrindo as duas formas que a API pode devolver.
 */
export const stravaStreamSetSchema = z.union([
  stravaStreamSetObjectSchema,
  stravaStreamSetArraySchema,
]);
