/**
 * DTO do objeto de erro do Strava (`Fault`) — forma remota (wire shape).
 *
 * Schema-first: tipos derivados dos schemas Zod via `z.infer`.
 *
 * _Requisitos: 11.2, 11.3_
 */

import type { z } from "zod";

import type {
  stravaErrorSchema,
  stravaFaultSchema,
} from "@/modules/strava/api/schemas/strava-fault";

/** Objeto de erro do Strava retornado em respostas 4xx/5xx. */
export type StravaFaultDto = z.infer<typeof stravaFaultSchema>;

/** Erro detalhado individual dentro de um `Fault`. */
export type StravaErrorDto = z.infer<typeof stravaErrorSchema>;
