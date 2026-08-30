/**
 * Schema Zod do evento de webhook do Strava (Event Data).
 *
 * Valida o corpo do POST enviado pelo Strava ao callback da subscription (Task
 * 7). O evento é persistido como `StravaWebhookEvent(PENDING)` e processado de
 * forma assíncrona; a rota deve responder 200 rápido.
 *
 * Campos confirmados na documentação oficial vigente
 * ([Strava Webhooks](https://developers.strava.com/docs/webhooks/)):
 * - `object_type`: sempre `"activity"` ou `"athlete"`.
 * - `object_id`: id da atividade (eventos de atividade) ou do atleta (long).
 * - `aspect_type`: sempre `"create"`, `"update"` ou `"delete"`.
 * - `updates`: hash; em updates de atividade pode conter `title`, `type`,
 *   `private`; em deauthorization contém sempre `authorized: "false"`.
 * - `owner_id`: id do atleta dono (long).
 * - `subscription_id`: id da subscription que recebe o evento (integer).
 * - `event_time`: epoch (segundos) em que o evento ocorreu (long).
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * Defensividade: `object_type`/`aspect_type` são validados por `enum` (valores
 * fechados na doc), mas `updates` é tolerante (`record` de chave→valor
 * desconhecido) porque suas chaves variam e são strings como `"false"`.
 *
 * _Requisitos: 11.2, 11.3_
 */

import { z } from "zod";

/** Tipo do objeto do evento. */
export const stravaWebhookObjectTypeSchema = z.enum(["activity", "athlete"]);

/** Aspecto (natureza) do evento. */
export const stravaWebhookAspectTypeSchema = z.enum([
  "create",
  "update",
  "delete",
]);

/** Evento de webhook do Strava (Event Data). */
export const stravaWebhookEventSchema = z
  .object({
    object_type: stravaWebhookObjectTypeSchema,
    object_id: z.number().int(),
    aspect_type: stravaWebhookAspectTypeSchema,
    // Chaves variam ("title"/"type"/"private"/"authorized"); valores chegam como
    // string ("false"/"true"). Mantemos tolerante para não falhar o safeParse.
    updates: z.record(z.string(), z.unknown()).optional(),
    owner_id: z.number().int(),
    subscription_id: z.number().int(),
    event_time: z.number().int(),
  })
  .passthrough();
