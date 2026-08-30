/**
 * Schema Zod do objeto de erro do Strava (`Fault`).
 *
 * O Strava retorna um `Fault` no corpo de respostas 4xx/5xx. O `StravaClient`
 * (Task 6) valida/parseia o corpo de erro com este schema para produzir
 * mensagens de log seguras (sem vazar secrets) e classificar falhas.
 *
 * Campos confirmados na documentação oficial vigente
 * ([Strava API Reference](https://developers.strava.com/docs/reference/) — "A
 * Fault describing the reason for the error"): um `Fault` tem `message` (string)
 * e `errors`, uma lista de erros detalhados, cada um com `resource`, `field` e
 * `code`.
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * Defensividade: tudo é opcional/tolerante — respostas de erro nem sempre trazem
 * um corpo `Fault` bem-formado (ex.: 5xx com HTML, 429 sem corpo).
 *
 * _Requisitos: 11.2, 11.3_
 */

import { z } from "zod";

/** Erro detalhado individual dentro de um `Fault`. */
export const stravaErrorSchema = z
  .object({
    resource: z.string().nullish(),
    field: z.string().nullish(),
    code: z.string().nullish(),
  })
  .passthrough();

/** Objeto de erro do Strava retornado em respostas 4xx/5xx. */
export const stravaFaultSchema = z
  .object({
    message: z.string().nullish(),
    errors: z.array(stravaErrorSchema).optional(),
  })
  .passthrough();
