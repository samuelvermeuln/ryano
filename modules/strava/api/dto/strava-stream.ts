/**
 * DTOs de stream / `StreamSet` do Strava — forma remota (wire shape).
 *
 * Schema-first: tipos derivados dos schemas Zod via `z.infer`. `StravaStreamSetDto`
 * cobre tanto a forma indexada por tipo (com `key_by_type=true`) quanto a forma
 * de array, refletindo a união tolerante do schema.
 *
 * _Requisitos: 11.2, 11.3_
 */

import type { z } from "zod";

import type {
  stravaBooleanStreamSchema,
  stravaLatLngStreamSchema,
  stravaNumberStreamSchema,
  stravaStreamSchema,
  stravaStreamSetObjectSchema,
  stravaStreamSetSchema,
} from "@/modules/strava/api/schemas/strava-stream";

/** Stream genérico (metadados + `data` tolerante). */
export type StravaStreamDto = z.infer<typeof stravaStreamSchema>;

/** Stream de valores numéricos. */
export type StravaNumberStreamDto = z.infer<typeof stravaNumberStreamSchema>;

/** Stream de coordenadas (`latlng`). */
export type StravaLatLngStreamDto = z.infer<typeof stravaLatLngStreamSchema>;

/** Stream booleano (`moving`). */
export type StravaBooleanStreamDto = z.infer<typeof stravaBooleanStreamSchema>;

/** `StreamSet` na forma indexada por tipo de stream. */
export type StravaStreamSetObjectDto = z.infer<
  typeof stravaStreamSetObjectSchema
>;

/** `StreamSet` (objeto indexado por tipo OU array de streams). */
export type StravaStreamSetDto = z.infer<typeof stravaStreamSetSchema>;
