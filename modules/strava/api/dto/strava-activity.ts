/**
 * DTOs de atividade do Strava — forma remota (wire shape).
 *
 * Schema-first: tipos derivados dos schemas Zod via `z.infer`
 * (`stravaSummaryActivitySchema`, `stravaDetailedActivitySchema`), evitando drift.
 * DTOs remotos; a normalização para `NormalizedActivity` é feita por parsers
 * (Task 6.2) — o DTO nunca vai direto ao domínio/UI (Req 11.4).
 *
 * _Requisitos: 11.2, 11.3_
 */

import type { z } from "zod";

import type {
  stravaDetailedActivitySchema,
  stravaSummaryActivitySchema,
} from "@/modules/strava/api/schemas/strava-activity";

/** Representação-resumo de atividade (itens de listagem/backfill). */
export type StravaSummaryActivityDto = z.infer<
  typeof stravaSummaryActivitySchema
>;

/** Representação detalhada de atividade (`GET /activities/{id}`). */
export type StravaDetailedActivityDto = z.infer<
  typeof stravaDetailedActivitySchema
>;
