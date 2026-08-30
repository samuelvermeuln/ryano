/**
 * DTO de volta (`Lap`) de atividade do Strava — forma remota (wire shape).
 *
 * Schema-first: tipo derivado de `stravaLapSchema` via `z.infer`.
 *
 * _Requisitos: 11.2, 11.3_
 */

import type { z } from "zod";

import type { stravaLapSchema } from "@/modules/strava/api/schemas/strava-lap";

/** Volta (lap) de uma atividade do Strava. */
export type StravaLapDto = z.infer<typeof stravaLapSchema>;
