/**
 * DTO do evento de webhook do Strava — forma remota (wire shape).
 *
 * Schema-first: tipo derivado de `stravaWebhookEventSchema` via `z.infer`.
 *
 * _Requisitos: 11.2, 11.3_
 */

import type { z } from "zod";

import type {
  stravaWebhookAspectTypeSchema,
  stravaWebhookEventSchema,
  stravaWebhookObjectTypeSchema,
} from "@/modules/strava/api/schemas/strava-webhook-event";

/** Evento de webhook do Strava (Event Data). */
export type StravaWebhookEventDto = z.infer<typeof stravaWebhookEventSchema>;

/** Tipo do objeto do evento: `"activity" | "athlete"`. */
export type StravaWebhookObjectType = z.infer<
  typeof stravaWebhookObjectTypeSchema
>;

/** Aspecto do evento: `"create" | "update" | "delete"`. */
export type StravaWebhookAspectType = z.infer<
  typeof stravaWebhookAspectTypeSchema
>;
