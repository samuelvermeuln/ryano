/**
 * Fixtures SANITIZADAS de streams de atividade do Strava
 * (`GET /activities/{id}/streams?keys=...&key_by_type=true`) para os testes do
 * `StravaClient` (Task 12.3).
 *
 * Nenhum dado real de usuário: as séries são curtas, inventadas e plausíveis;
 * as coordenadas de `latlng` são placeholders (não apontam para nenhum local
 * real de treino). Sem PII e sem segredos.
 *
 * As formas espelham o "wire shape" documentado do `StreamSet` na forma indexada
 * por tipo (`modules/strava/api/schemas/strava-stream.ts`): cada stream tem
 * `type`, `data`, `series_type`, `original_size` e `resolution`.
 *
 * Ficam sob `modules/strava/tests/fixtures/` conforme exigido pelo Req 21.3 do
 * spec `integracoes-modulares`, seguindo o padrão de `strava-activities.ts`.
 *
 * _Requisitos: 9.1, 9.4_
 */

type Overrides = Record<string, unknown>;

/**
 * Conjunto de `keys` usado nos testes — espelha os tipos de stream relevantes
 * para o enriquecimento de detalhe (tempo, FC, cadência, distância, velocidade).
 */
export const SANITIZED_STREAM_KEYS = [
  "time",
  "heartrate",
  "cadence",
  "distance",
  "velocity_smooth",
] as const;

/** Número de amostras de todas as séries das fixtures (todas alinhadas). */
export const SANITIZED_STREAM_SAMPLE_COUNT = 5;

/** Constrói um stream numérico (`data: number[]`) na forma remota. */
function numberStream(type: string, data: readonly number[], overrides: Overrides = {}) {
  return {
    type,
    data: [...data],
    series_type: "distance",
    original_size: data.length,
    resolution: "high",
    ...overrides,
  };
}

/**
 * `StreamSet` "completo": todos os streams pedidos em
 * {@link SANITIZED_STREAM_KEYS} presentes e alinhados no mesmo índice
 * (mesmo instante), como a doc descreve.
 */
export function buildStreamSet(overrides: Overrides = {}) {
  return {
    time: numberStream("time", [0, 10, 20, 30, 40], { series_type: "time" }),
    heartrate: numberStream("heartrate", [118, 132, 145, 151, 149]),
    cadence: numberStream("cadence", [80, 82, 84, 83, 81]),
    distance: numberStream("distance", [0, 62.5, 128.4, 195.1, 260.8]),
    velocity_smooth: numberStream("velocity_smooth", [0, 6.2, 6.5, 6.7, 6.6]),
    ...overrides,
  };
}

/**
 * `StreamSet` "rico": além dos numéricos, inclui `latlng` (pares de
 * coordenadas placeholder), `moving` (booleano), `altitude`, `watts`, `temp` e
 * `grade_smooth` — exercita todos os ramos do schema indexado por tipo.
 */
export function buildFullStreamSet(overrides: Overrides = {}) {
  return {
    ...buildStreamSet(),
    altitude: numberStream("altitude", [12.1, 15.4, 18.9, 22.3, 20.7]),
    watts: numberStream("watts", [0, 180, 205, 212, 198]),
    temp: numberStream("temp", [18, 18, 19, 19, 19]),
    grade_smooth: numberStream("grade_smooth", [0, 1.2, 2.4, -0.8, -1.5]),
    latlng: {
      type: "latlng",
      data: [
        [0.001, 0.001],
        [0.002, 0.002],
        [0.003, 0.003],
        [0.004, 0.004],
        [0.005, 0.005],
      ],
      series_type: "distance",
      original_size: 5,
      resolution: "high",
    },
    moving: {
      type: "moving",
      data: [false, true, true, true, true],
      series_type: "distance",
      original_size: 5,
      resolution: "high",
    },
    ...overrides,
  };
}

/**
 * `StreamSet` PARCIAL: a atividade só tem `time` + `heartrate` (sem cadência,
 * sem velocidade, sem distância). Streams ausentes simplesmente não aparecem no
 * objeto — ausência de dado, não erro (Req 9.4).
 */
export function buildHeartRateOnlyStreamSet(overrides: Overrides = {}) {
  return {
    time: numberStream("time", [0, 10, 20, 30, 40], { series_type: "time" }),
    heartrate: numberStream("heartrate", [118, 132, 145, 151, 149]),
    ...overrides,
  };
}

/**
 * `StreamSet` VAZIO (`{}`): atividade sem nenhum dos streams pedidos. Continua
 * sendo uma resposta válida para o schema — o chamador trata como ausência.
 */
export function buildEmptyStreamSet() {
  return {};
}

/**
 * `StreamSet` com stream sem metadados opcionais (`series_type`/`resolution`/
 * `original_size` ausentes): o schema é defensivo e não deve quebrar.
 */
export function buildStreamSetWithoutMetadata() {
  return {
    heartrate: { data: [120, 130, 140] },
  };
}

/**
 * Payload INVÁLIDO: `heartrate.data` traz strings em vez de números, violando
 * `stravaNumberStreamSchema`. Usado para checar que o client rejeita com
 * `STRAVA_INVALID_RESPONSE` em vez de deixar o payload vazar para o domínio.
 */
export const INVALID_STREAM_SET_PAYLOAD = {
  heartrate: {
    type: "heartrate",
    data: ["118", "132", "145"],
    series_type: "distance",
    original_size: 3,
    resolution: "high",
  },
} as const;

/**
 * Payload inválido para a forma indexada: resposta no formato de ARRAY (o que a
 * API devolveria sem `key_by_type=true`). Como o client fixa `key_by_type=true`
 * e valida com `stravaStreamSetObjectSchema`, este payload deve falhar.
 */
export const ARRAY_SHAPED_STREAM_PAYLOAD = [
  {
    type: "heartrate",
    data: [118, 132, 145],
    series_type: "distance",
    original_size: 3,
    resolution: "high",
  },
] as const;
