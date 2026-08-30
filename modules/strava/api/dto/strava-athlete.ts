/**
 * DTO do atleta do Strava — forma remota (wire shape).
 *
 * Schema-first: o tipo é derivado do schema Zod (`stravaAthleteSchema`) via
 * `z.infer`, garantindo que validação de runtime e tipo estático nunca divirjam.
 * Este DTO é a forma remota bruta; a conversão para o domínio/UI é feita por
 * parsers (Task 6.2) — o DTO nunca atravessa direto (Req 11.4).
 *
 * _Requisitos: 11.2, 11.3_
 */

import type { z } from "zod";

import type {
  stravaAthleteSchema,
  stravaSummaryGearSchema,
} from "@/modules/strava/api/schemas/strava-athlete";

/** Atleta do Strava (resumo + campos detalhados relevantes). */
export type StravaAthleteDto = z.infer<typeof stravaAthleteSchema>;

/** Item de equipamento resumido (bike/shoe) do atleta detalhado. */
export type StravaSummaryGearDto = z.infer<typeof stravaSummaryGearSchema>;
