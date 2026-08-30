/**
 * Schemas Zod compartilhados entre os DTOs do Strava (sub-objetos reutilizados
 * em atividade, volta/lap, streams, etc.).
 *
 * ─── Abordagem: schema-first ────────────────────────────────────────────────
 * Os schemas Zod são a fonte da verdade da forma remota; os tipos TypeScript em
 * `api/dto/**` são derivados via `z.infer`, evitando drift entre validação de
 * runtime e tipos estáticos. Estes schemas validam apenas o "wire shape" remoto
 * (Req 11.3); um parser (Task 6.2) converte para `NormalizedActivity` — o DTO
 * remoto nunca atravessa direto para domínio/UI (Req 11.4).
 *
 * ─── Nota sobre ids numéricos ───────────────────────────────────────────────
 * O Strava usa inteiros grandes (`long`) para ids de atleta/atividade. Em uso
 * real esses ids permanecem dentro de `Number.MAX_SAFE_INTEGER`
 * (ids de atividade atuais têm ~10–11 dígitos), então os tipamos como `number`,
 * casando com a escolha do schema de token (Task 5.3, `athlete.id: z.number`).
 * A conversão para `string` (identidade de persistência `provider+externalId+
 * userId`) acontece no parser/aplicação, não aqui.
 *
 * ─── Defensividade ──────────────────────────────────────────────────────────
 * Campos que o Strava pode omitir (sem device/potência/HR, atividades manuais)
 * são `optional`/`nullable`; usamos `.passthrough()` para tolerar campos novos
 * da API (forward-compat) sem quebrar `safeParse`.
 *
 * Forma dos objetos confirmada na documentação oficial vigente
 * ([Strava API Reference](https://developers.strava.com/docs/reference/)).
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * _Requisitos: 11.2, 11.3_
 */

import { z } from "zod";

/** Resolução de um stream: `"low" | "medium" | "high"`. */
export const stravaStreamResolutionSchema = z.enum(["low", "medium", "high"]);

/** Eixo de indexação de um stream/split: por `"distance"` ou por `"time"`. */
export const stravaSeriesTypeSchema = z.enum(["distance", "time"]);

/**
 * Par de coordenadas `[lat, lng]`. O Strava pode retornar `[]` (vazio) quando
 * não há GPS; por isso não fixamos o comprimento e tratamos como lista de
 * números, mantendo a forma tolerante.
 */
export const stravaLatLngSchema = z.array(z.number());

/**
 * Referência-resumo (meta) a um atleta: normalmente apenas `id` e
 * `resource_state`. Aparece embutida em atividades e voltas.
 */
export const stravaMetaAthleteSchema = z
  .object({
    id: z.number().int().optional(),
    resource_state: z.number().int().optional(),
  })
  .passthrough();

/**
 * Referência-resumo (meta) a uma atividade: `id` e `resource_state`. Aparece
 * embutida em `Lap`.
 */
export const stravaMetaActivitySchema = z
  .object({
    id: z.number().int().optional(),
    resource_state: z.number().int().optional(),
  })
  .passthrough();

/**
 * Mapa/polilinha de uma atividade ou segmento. `polyline` (detalhada) só vem em
 * representações detalhadas; `summary_polyline` costuma vir no resumo. Ambos
 * podem ser `null`/ausentes em atividades sem GPS.
 */
export const stravaPolylineMapSchema = z
  .object({
    id: z.string().optional(),
    polyline: z.string().nullish(),
    summary_polyline: z.string().nullish(),
    resource_state: z.number().int().optional(),
  })
  .passthrough();

/**
 * Split (parcial por km/milha) de uma atividade detalhada. Todos os campos são
 * opcionais/toleráveis: o conjunto exato varia por tipo de atividade.
 */
export const stravaSplitSchema = z
  .object({
    distance: z.number().nullish(),
    elapsed_time: z.number().int().nullish(),
    elevation_difference: z.number().nullish(),
    moving_time: z.number().int().nullish(),
    split: z.number().int().nullish(),
    average_speed: z.number().nullish(),
    average_grade_adjusted_speed: z.number().nullish(),
    average_heartrate: z.number().nullish(),
    pace_zone: z.number().int().nullish(),
  })
  .passthrough();
