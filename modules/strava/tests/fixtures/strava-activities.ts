/**
 * Fixtures SANITIZADAS de atividades do Strava (Req 21.3) para os testes de
 * API/sync (Task 6.5).
 *
 * Nenhum dado real: ids, nomes e coordenadas são placeholders inventados. Sem
 * PII (email/telefone) e sem segredos. As formas espelham o "wire shape"
 * documentado de `SummaryActivity` / `DetailedActivity`
 * (`modules/strava/api/schemas/strava-activity.ts`).
 *
 * Ficam sob `modules/strava/tests/fixtures/` conforme exigido pelo Req 21.3.
 */

/** Id de atleta sanitizado (inventado). */
export const SANITIZED_ATHLETE_ID = 1234567;

/** Ids de atividade sanitizados (inventados). */
export const SANITIZED_ACTIVITY_IDS = {
  ride: 9_000_000_001,
  run: 9_000_000_002,
  manual: 9_000_000_003,
} as const;

type Overrides = Record<string, unknown>;

/**
 * Atividade-resumo "completa" (com HR/potência/mapa) — cobre o caminho feliz
 * com todos os campos opcionais presentes.
 */
export function buildSummaryActivity(overrides: Overrides = {}) {
  return {
    id: SANITIZED_ACTIVITY_IDS.ride,
    resource_state: 2,
    external_id: "sanitized-external-id-1.fit",
    upload_id: 8_000_000_001,
    athlete: { id: SANITIZED_ATHLETE_ID, resource_state: 1 },
    name: "Sanitized Morning Ride",
    distance: 25_000.5,
    moving_time: 3600,
    elapsed_time: 3720,
    total_elevation_gain: 320.4,
    type: "Ride",
    sport_type: "Ride",
    workout_type: 10,
    start_date: "2024-05-01T07:00:00Z",
    start_date_local: "2024-05-01T09:00:00Z",
    timezone: "(GMT+01:00) Europe/Lisbon",
    utc_offset: 3600,
    achievement_count: 2,
    kudos_count: 5,
    comment_count: 0,
    athlete_count: 1,
    photo_count: 0,
    total_photo_count: 0,
    map: {
      id: "a9000000001",
      summary_polyline: "sanitized_polyline_abc",
      resource_state: 2,
    },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    flagged: false,
    average_speed: 6.94,
    max_speed: 14.2,
    average_cadence: 82.5,
    average_watts: 190.3,
    weighted_average_watts: 205,
    kilojoules: 684.2,
    device_watts: true,
    has_heartrate: true,
    average_heartrate: 142.3,
    max_heartrate: 176,
    max_watts: 480,
    elev_high: 210.5,
    elev_low: 12.1,
    pr_count: 1,
    has_kudoed: false,
    ...overrides,
  };
}

/**
 * Atividade-resumo de corrida (segunda entrada de uma página).
 */
export function buildSummaryRun(overrides: Overrides = {}) {
  return buildSummaryActivity({
    id: SANITIZED_ACTIVITY_IDS.run,
    external_id: "sanitized-external-id-2.fit",
    name: "Sanitized Evening Run",
    type: "Run",
    sport_type: "Run",
    distance: 10_000,
    moving_time: 3000,
    elapsed_time: 3050,
    total_elevation_gain: 80,
    average_speed: 3.33,
    max_speed: 4.5,
    average_cadence: 88,
    start_date: "2024-05-01T18:00:00Z",
    ...overrides,
  });
}

/**
 * Atividade-resumo com PAYLOAD PARCIAL: atividade manual sem HR, sem potência,
 * sem mapa, sem cadência (campos opcionais ausentes). Só os campos base (`id`,
 * `start_date`) + o mínimo. Exercita a defensividade do schema (Req 21.4).
 */
export function buildMinimalActivity(overrides: Overrides = {}) {
  return {
    id: SANITIZED_ACTIVITY_IDS.manual,
    name: "Sanitized Manual Workout",
    type: "Workout",
    sport_type: "Workout",
    distance: 0,
    moving_time: 1800,
    elapsed_time: 1800,
    manual: true,
    start_date: "2024-05-02T12:00:00Z",
    ...overrides,
  };
}

/**
 * Atividade DETALHADA (`GET /activities/{id}`): estende o resumo com campos
 * ricos (descrição, calorias, laps, splits).
 */
export function buildDetailedActivity(overrides: Overrides = {}) {
  return {
    ...buildSummaryActivity(),
    resource_state: 3,
    description: "Sanitized description",
    calories: 720.5,
    device_name: "Sanitized Device",
    segment_efforts: [],
    splits_metric: [
      {
        distance: 1000,
        elapsed_time: 240,
        moving_time: 238,
        split: 1,
        average_speed: 4.2,
        average_heartrate: 140,
        pace_zone: 2,
      },
    ],
    laps: [],
    ...overrides,
  };
}
