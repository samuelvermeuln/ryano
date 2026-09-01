/**
 * Fixtures SANITIZADAS de voltas de atividade do Strava
 * (`GET /activities/{id}/laps`) para os testes do `StravaClient` (Task 12.3).
 *
 * Nenhum dado real de usuário: ids de lap/atividade/atleta são placeholders
 * inventados e as métricas são plausíveis, mas fictícias. Sem PII e sem
 * segredos.
 *
 * As formas espelham o "wire shape" documentado de `Lap`
 * (`modules/strava/api/schemas/strava-lap.ts`): só `id` é exigido; métricas
 * dependentes de sensor são opcionais/nulas.
 *
 * Ficam sob `modules/strava/tests/fixtures/` conforme exigido pelo Req 21.3 do
 * spec `integracoes-modulares`, seguindo o padrão de `strava-activities.ts`.
 *
 * _Requisitos: 9.2, 9.4_
 */

import {
  SANITIZED_ACTIVITY_IDS,
  SANITIZED_ATHLETE_ID,
} from "@/modules/strava/tests/fixtures/strava-activities";

/** Ids de lap sanitizados (inventados). */
export const SANITIZED_LAP_IDS = {
  first: 7_000_000_001,
  second: 7_000_000_002,
  third: 7_000_000_003,
} as const;

type Overrides = Record<string, unknown>;

/**
 * Volta "completa" (com HR, cadência e potência) da atividade de ciclismo
 * sanitizada — cobre o caminho feliz com todos os campos opcionais presentes.
 */
export function buildLap(overrides: Overrides = {}) {
  return {
    id: SANITIZED_LAP_IDS.first,
    resource_state: 2,
    name: "Lap 1",
    activity: { id: SANITIZED_ACTIVITY_IDS.ride, resource_state: 1 },
    athlete: { id: SANITIZED_ATHLETE_ID, resource_state: 1 },
    elapsed_time: 1200,
    moving_time: 1180,
    start_date: "2024-05-01T07:00:00Z",
    start_date_local: "2024-05-01T09:00:00Z",
    distance: 8_000.5,
    start_index: 0,
    end_index: 1199,
    total_elevation_gain: 110.2,
    average_speed: 6.67,
    max_speed: 12.4,
    average_cadence: 82.5,
    device_watts: true,
    average_watts: 188.4,
    average_heartrate: 138.6,
    max_heartrate: 162,
    lap_index: 1,
    split: 1,
    pace_zone: 2,
    ...overrides,
  };
}

/**
 * Lista de voltas de uma atividade com 3 voltas, com `lap_index`/`split`
 * sequenciais — a forma típica de `GET /activities/{id}/laps`.
 */
export function buildLapList() {
  return [
    buildLap(),
    buildLap({
      id: SANITIZED_LAP_IDS.second,
      name: "Lap 2",
      lap_index: 2,
      split: 2,
      start_index: 1200,
      end_index: 2399,
      elapsed_time: 1260,
      moving_time: 1240,
      distance: 8_500.25,
      average_speed: 6.85,
      average_heartrate: 145.1,
    }),
    buildLap({
      id: SANITIZED_LAP_IDS.third,
      name: "Lap 3",
      lap_index: 3,
      split: 3,
      start_index: 2400,
      end_index: 3599,
      elapsed_time: 1260,
      moving_time: 1200,
      distance: 8_499.75,
      average_speed: 6.75,
      average_heartrate: 149.8,
    }),
  ];
}

/**
 * Volta com PAYLOAD PARCIAL: sem HR, sem cadência, sem potência e sem mapa de
 * índices — exercita a defensividade do schema (campos opcionais ausentes).
 */
export function buildMinimalLap(overrides: Overrides = {}) {
  return {
    id: SANITIZED_LAP_IDS.first,
    lap_index: 1,
    elapsed_time: 600,
    distance: 1_000,
    ...overrides,
  };
}

/**
 * Volta com campos opcionais explicitamente `null` (o Strava usa `null` para
 * métricas sem sensor). O schema é `nullish`, então isso deve validar.
 */
export function buildLapWithNullMetrics(overrides: Overrides = {}) {
  return {
    id: SANITIZED_LAP_IDS.second,
    name: null,
    lap_index: 2,
    elapsed_time: 600,
    moving_time: null,
    distance: null,
    average_cadence: null,
    average_watts: null,
    device_watts: null,
    average_heartrate: null,
    max_heartrate: null,
    ...overrides,
  };
}

/** Atividade sem voltas registradas: lista vazia (ausência de dado, não erro). */
export function buildEmptyLapList(): unknown[] {
  return [];
}

/**
 * Payload INVÁLIDO: lap sem `id` (único campo exigido por `stravaLapSchema`).
 * O client deve rejeitar com `STRAVA_INVALID_RESPONSE`.
 */
export const INVALID_LAP_LIST_PAYLOAD = [
  { name: "Lap sem id", elapsed_time: 600 },
] as const;

/**
 * Payload INVÁLIDO na forma: `GET /activities/{id}/laps` devolve um ARRAY, então
 * um objeto no lugar da lista deve falhar em `stravaLapListSchema`.
 */
export const OBJECT_SHAPED_LAP_PAYLOAD = {
  laps: [{ id: SANITIZED_LAP_IDS.first }],
} as const;
