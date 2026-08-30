/**
 * Schema Zod do atleta do Strava (`SummaryAthlete` + campos relevantes de
 * `DetailedAthlete`).
 *
 * Usado pela chamada `getAuthenticatedAthlete` do `StravaClient` (Task 6) e em
 * parsers/aplicação. Apenas `id` é efetivamente exigido; todo o resto é
 * opcional/tolerante, pois o payload varia conforme scopes e completude do
 * perfil.
 *
 * Campos confirmados na documentação oficial vigente
 * ([Strava API Reference](https://developers.strava.com/docs/reference/)):
 * `SummaryAthlete` expõe `id`, `resource_state`, `firstname`, `lastname`,
 * `profile`/`profile_medium`, `city`, `state`, `country`, `sex`, `premium`/
 * `summit`, `created_at`, `updated_at`. `DetailedAthlete` acrescenta contadores
 * (`follower_count`, `friend_count`), `measurement_preference`, `ftp`, `weight`
 * e coleções de equipamentos (`clubs`, `bikes`, `shoes`).
 * (Conteúdo parafraseado para conformidade com as restrições de licenciamento.)
 *
 * _Requisitos: 11.2, 11.3_
 */

import { z } from "zod";

/**
 * Item de equipamento resumido (bikes/shoes) presente no atleta detalhado.
 * Mantido tolerante — não é consumido diretamente pela normalização.
 */
export const stravaSummaryGearSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().nullish(),
    primary: z.boolean().optional(),
    distance: z.number().nullish(),
    resource_state: z.number().int().optional(),
  })
  .passthrough();

/**
 * Atleta do Strava (resumo + campos detalhados relevantes).
 *
 * `sex` é `"M" | "F"` quando presente, mas o Strava pode retornar `null`; por
 * isso não usamos `enum` estrito e sim `string().nullish()` para não falhar o
 * `safeParse` diante de valores inesperados.
 */
export const stravaAthleteSchema = z
  .object({
    id: z.number().int(),
    resource_state: z.number().int().optional(),
    firstname: z.string().nullish(),
    lastname: z.string().nullish(),
    username: z.string().nullish(),
    profile: z.string().nullish(),
    profile_medium: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    country: z.string().nullish(),
    sex: z.string().nullish(),
    premium: z.boolean().optional(),
    summit: z.boolean().optional(),
    created_at: z.string().nullish(),
    updated_at: z.string().nullish(),
    // Campos de DetailedAthlete (presentes conforme scope/endpoint):
    follower_count: z.number().int().nullish(),
    friend_count: z.number().int().nullish(),
    measurement_preference: z.string().nullish(),
    ftp: z.number().nullish(),
    weight: z.number().nullish(),
    clubs: z.array(z.unknown()).optional(),
    bikes: z.array(stravaSummaryGearSchema).optional(),
    shoes: z.array(stravaSummaryGearSchema).optional(),
  })
  .passthrough();
