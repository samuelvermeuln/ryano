/**
 * Teste de propriedade da COMPOSIÇÃO da seção de análise do treino do Strava
 * (Tarefa 17.4 do spec `detalhe-atividade-multi-provider`).
 *
 * Alvo: `getStravaActivityVisualData`
 * (`modules/strava/application/activities/strava-activity-details.ts`), na parte
 * montada por `buildWorkoutAnalysisSection` — a seção `metricSections` de id
 * `STRAVA_WORKOUT_ANALYSIS_SECTION_ID`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * As três fontes de dado da seção (Requisito 6.1)
 *
 * A seção é composta por três sub-blocos, um por fonte, sempre nesta ordem:
 *
 * 1. **zonas de FC** (calculadas a partir do stream de FC) → linhas de leitura
 *    do esforço (`tempo em zonas leves/moderada/intensas`);
 * 2. **laps/splits** → contagem de splits e variação de ritmo/cadência/FC entre
 *    eles;
 * 3. **séries (streams)** → faixa percorrida por cada série ao longo do treino.
 *
 * A disponibilidade de cada fonte é conduzida por um `StravaClient` falso
 * injetado (um `StreamSet` com/sem `heartrate`/`cadence`, laps presentes ou
 * ausentes) mais os campos da atividade que destravam a FC máxima de referência
 * (`maxHeartRate > averageHeartRate`), sem a qual as zonas calculadas não são
 * exibidas (Requisito 2.4-c). Os DTOs gerados passam pelos schemas Zod reais
 * (`stravaStreamSetObjectSchema`/`stravaLapListSchema`) antes de chegarem ao
 * client falso: nada aqui é um payload que a API não poderia devolver.
 *
 * Note que as três fontes NÃO são independentes por construção: o stream de FC
 * alimenta tanto a fonte 1 quanto a fonte 3. É por isso que o oráculo deste
 * teste deriva a disponibilidade de cada fonte do cenário gerado (streams/laps/
 * FC máx. de referência), e não de um "knob" solto — as 8 combinações de
 * disponibilidade continuam todas cobertas (ver o teste determinístico que
 * enumera as 8), inclusive as duas que só existem em dados reais de borda:
 * zonas sem série (stream de FC com uma única leitura útil, o resto em `0`, que
 * é como o Strava representa trecho sem sensor) e série sem zonas (stream de FC
 * ou de cadência presente, mas sem FC máxima de referência).
 *
 * O único mock é o `logger` (silenciar a saída estruturada de ~100 execuções);
 * todo o resto — cálculo de zonas, parsers, catálogo de capabilities, regras de
 * categoria — é o código real.
 *
 * Modalidade do sweep: `run` (categoria `endurance-pace`, `workoutAnalysis:
 * "full"`), a categoria que admite todos os sub-blocos. Um último teste fixa o
 * outro extremo: categoria com `workoutAnalysis: false` não exibe a seção de
 * forma alguma.
 */

import type { Activity } from "@prisma/client";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { HEART_RATE_ZONES_SECTION_ID } from "@/modules/shared/activities/heart-rate-zones";
import { METRIC_DISPLAY_RULES } from "@/modules/shared/activities/metric-display-categories";
import type {
  ActivityMetricRow,
  ActivityVisualData,
} from "@/modules/shared/activities/presentation/activity-visual-data";
import type { StravaClient } from "@/modules/strava/api/client";
import type {
  StravaLapDto,
  StravaStreamSetObjectDto,
} from "@/modules/strava/api/dto";
import {
  stravaLapListSchema,
  stravaStreamSetObjectSchema,
} from "@/modules/strava/api/schemas";
import {
  getStravaActivityVisualData,
  stravaActivityVisualCache,
  STRAVA_SPLITS_SECTION_ID,
  STRAVA_WORKOUT_ANALYSIS_SECTION_ID,
} from "@/modules/strava/application/activities/strava-activity-details";

const NUM_RUNS = 120;

/** Instante fixo: o TTL do cache nunca interfere no resultado. */
const FIXED_NOW = Date.UTC(2026, 1, 1, 12, 0, 0);

/** Espaçamento entre amostras das séries geradas (segundos). */
const SAMPLE_INTERVAL_SECONDS = 5;

// ---------------------------------------------------------------------------
// Rótulos esperados por sub-bloco (categoria `endurance-pace`)
// ---------------------------------------------------------------------------

/** Sub-bloco 1 — leitura do esforço a partir das zonas de FC. */
const EFFORT_LABELS = [
  "Tempo em zonas leves",
  "Tempo em zona moderada",
  "Tempo em zonas intensas",
] as const;

/** Sub-bloco 2 — linhas derivadas dos laps/splits. */
const SPLIT_COUNT_LABEL = "Splits registrados";
const SPLIT_PACE_LABEL = "Variação de ritmo entre splits";
const SPLIT_CADENCE_LABEL = "Variação de cadência entre splits";
const SPLIT_HEART_RATE_LABEL = "Variação de FC entre splits";

/** Sub-bloco 3 — faixas das séries do treino. */
const STREAM_HEART_RATE_LABEL = "FC ao longo do treino";
const STREAM_CADENCE_LABEL = "Cadência ao longo do treino";

/**
 * Rótulos que a categoria `endurance-pace` NUNCA exibe (não tem
 * `speedFallback`): servem para provar que nenhum sub-bloco de fonte/métrica
 * fora da categoria vaza para a seção.
 */
const FORBIDDEN_LABELS = [
  "Variação de velocidade entre splits",
  "Velocidade ao longo do treino",
  "Voltas registradas",
] as const;

// ---------------------------------------------------------------------------
// Cenário gerado
// ---------------------------------------------------------------------------

/** Um lap gerado: `null` representa a métrica ausente no DTO do Strava. */
interface LapSpec {
  elapsedTime: number;
  distance: number;
  averageSpeed: number | null;
  averageCadence: number | null;
  averageHeartRate: number | null;
}

interface Scenario {
  /** O `StreamSet` inclui a série `heartrate`? */
  hasHeartRateStream: boolean;
  /** O `StreamSet` inclui a série `cadence`? */
  hasCadenceStream: boolean;
  /**
   * A atividade tem FC máxima de referência (`maxHeartRate > averageHeartRate`)?
   * Sem ela, o Requisito 2.4-c manda não exibir zonas calculadas.
   */
  hasMaxHeartRateReference: boolean;
  /** Amostras de FC (bpm). `0` = trecho sem leitura de sensor. */
  heartRateValues: number[];
  /** Amostras de cadência (spm). `0` = trecho parado. */
  cadenceValues: number[];
  laps: LapSpec[];
}

/** Métrica opcional do lap: presente e positiva, ou ausente. */
function optionalMetric(
  min: number,
  max: number,
): fc.Arbitrary<number | null> {
  return fc.oneof(
    { arbitrary: fc.integer({ min, max }), weight: 3 },
    { arbitrary: fc.constant(null), weight: 1 },
  );
}

const lapSpec: fc.Arbitrary<LapSpec> = fc.record({
  // Duração e distância sempre positivas: o que este teste explora é a
  // composição por fonte, não o descarte de lap sem grandeza (coberto pelos
  // testes de omissão graciosa).
  elapsedTime: fc.integer({ min: 60, max: 900 }),
  distance: fc.integer({ min: 200, max: 3_000 }),
  averageSpeed: optionalMetric(2, 6),
  averageCadence: optionalMetric(70, 95),
  averageHeartRate: optionalMetric(110, 185),
});

/**
 * Cenário arbitrário. As amostras de FC/cadência compartilham o mesmo
 * comprimento (`sampleCount`), como acontece nas respostas reais do Strava, e
 * podem conter `0` — que o cálculo de zonas conta como recuperação, mas as
 * faixas das séries descartam (guarda contra "valor zerado enganoso",
 * Requisito 4.4).
 */
const scenario: fc.Arbitrary<Scenario> = fc
  .record({
    hasHeartRateStream: fc.boolean(),
    hasCadenceStream: fc.boolean(),
    hasMaxHeartRateReference: fc.boolean(),
    sampleCount: fc.integer({ min: 2, max: 12 }),
    heartRateSeed: fc.array(
      fc.oneof(
        { arbitrary: fc.integer({ min: 90, max: 195 }), weight: 5 },
        { arbitrary: fc.constant(0), weight: 1 },
      ),
      { minLength: 12, maxLength: 12 },
    ),
    cadenceSeed: fc.array(
      fc.oneof(
        { arbitrary: fc.integer({ min: 60, max: 100 }), weight: 5 },
        { arbitrary: fc.constant(0), weight: 1 },
      ),
      { minLength: 12, maxLength: 12 },
    ),
    laps: fc.array(lapSpec, { maxLength: 6 }),
  })
  .map(
    ({
      hasHeartRateStream,
      hasCadenceStream,
      hasMaxHeartRateReference,
      sampleCount,
      heartRateSeed,
      cadenceSeed,
      laps,
    }) => ({
      hasHeartRateStream,
      hasCadenceStream,
      hasMaxHeartRateReference,
      heartRateValues: heartRateSeed.slice(0, sampleCount),
      cadenceValues: cadenceSeed.slice(0, sampleCount),
      laps,
    }),
  );

// ---------------------------------------------------------------------------
// DTOs (validados pelos schemas Zod reais antes de chegarem ao client falso)
// ---------------------------------------------------------------------------

function numberStreamRaw(data: readonly number[]): Record<string, unknown> {
  return {
    type: "unused",
    data: [...data],
    series_type: "time",
    original_size: data.length,
    resolution: "high",
  };
}

/**
 * Monta o `StreamSet` do cenário e o valida com o schema real. O eixo `time`
 * acompanha qualquer série presente (é o que `toHeartRateSamples` pareia por
 * índice com `heartrate`).
 */
function buildStreamSet(spec: Scenario): StravaStreamSetObjectDto {
  const raw: Record<string, unknown> = {};
  const sampleCount = Math.max(
    spec.hasHeartRateStream ? spec.heartRateValues.length : 0,
    spec.hasCadenceStream ? spec.cadenceValues.length : 0,
  );

  if (sampleCount > 0) {
    raw.time = numberStreamRaw(
      Array.from(
        { length: sampleCount },
        (_, index) => index * SAMPLE_INTERVAL_SECONDS,
      ),
    );
  }

  if (spec.hasHeartRateStream) {
    raw.heartrate = numberStreamRaw(spec.heartRateValues);
  }

  if (spec.hasCadenceStream) {
    raw.cadence = numberStreamRaw(spec.cadenceValues);
  }

  const validation = stravaStreamSetObjectSchema.safeParse(raw);

  expect(validation.success).toBe(true);

  if (!validation.success) {
    throw validation.error;
  }

  return validation.data;
}

/** Monta a lista de laps do cenário e a valida com o schema real. */
function buildLaps(spec: Scenario): StravaLapDto[] {
  const raw = spec.laps.map((lap, index) => ({
    id: 1_000 + index,
    lap_index: index + 1,
    elapsed_time: lap.elapsedTime,
    moving_time: lap.elapsedTime,
    distance: lap.distance,
    ...(lap.averageSpeed === null ? {} : { average_speed: lap.averageSpeed }),
    ...(lap.averageCadence === null
      ? {}
      : { average_cadence: lap.averageCadence }),
    ...(lap.averageHeartRate === null
      ? {}
      : { average_heartrate: lap.averageHeartRate }),
  }));

  const validation = stravaLapListSchema.safeParse(raw);

  expect(validation.success).toBe(true);

  if (!validation.success) {
    throw validation.error;
  }

  return validation.data;
}

/** Client falso: devolve exatamente as fontes do cenário, sem rede. */
function makeClient(spec: Scenario): StravaClient {
  return {
    getActivityStreams: async () => buildStreamSet(spec),
    getActivityLaps: async () => buildLaps(spec),
  } as unknown as StravaClient;
}

/**
 * Atividade no formato Prisma `Activity`, sem nenhum dado pessoal real.
 * `sportType: "run"` → categoria `endurance-pace` (`workoutAnalysis: "full"`).
 */
function makeActivity(spec: Scenario, sportType = "run"): Activity {
  return {
    id: "act_workout_analysis",
    userId: "user_property",
    wearableConnectionId: "conn_property",
    externalId: "ext_property",
    provider: "STRAVA",
    sportType,
    providerSportType: null,
    name: "Atividade de teste",
    startedAt: new Date("2026-01-10T10:00:00.000Z"),
    endedAt: null,
    durationSeconds: 3_600,
    movingSeconds: null,
    distanceMeters: 10_000,
    calories: null,
    averageHeartRate: 140,
    // Fonte da FC máxima de referência (Requisito 2.4-a): quando ausente, o
    // cálculo de zonas não tem denominador e a fonte 1 fica indisponível.
    maxHeartRate: spec.hasMaxHeartRateReference ? 185 : null,
    averagePace: 300,
    averageSpeed: 3.33,
    maxSpeed: null,
    elevationGain: null,
    averageCadence: 170,
    averagePower: null,
    maxPower: null,
    timezone: null,
    metrics: null,
    rawPayload: null,
    createdAt: new Date("2026-01-10T10:30:00.000Z"),
    updatedAt: new Date("2026-01-10T10:30:00.000Z"),
  } as unknown as Activity;
}

// ---------------------------------------------------------------------------
// Oráculo: disponibilidade das três fontes e sub-blocos esperados
// ---------------------------------------------------------------------------

/** Quantas amostras/laps têm valor utilizável (positivo e finito). */
function countPositive(values: readonly (number | null)[]): number {
  return values.filter(
    (value): value is number =>
      value !== null && Number.isFinite(value) && value > 0,
  ).length;
}

interface ExpectedComposition {
  /** Fonte 1 — zonas de FC calculadas. */
  zonesAvailable: boolean;
  /** Fonte 2 — laps/splits. */
  splitsAvailable: boolean;
  /** Fonte 3 — séries do treino (as que a categoria exibe). */
  seriesAvailable: boolean;
  /** Rótulos exatos do sub-bloco de splits, na ordem em que são montados. */
  splitLabels: string[];
  /** Rótulos exatos do sub-bloco de séries, na ordem em que são montados. */
  streamLabels: string[];
  /** A seção de análise do treino deve existir? */
  sectionExpected: boolean;
}

/**
 * Deriva a composição esperada do cenário.
 *
 * - fonte 1 (zonas): exige stream de FC (sempre com ≥ 2 amostras, logo tempo
 *   total > 0) **e** FC máxima de referência;
 * - fonte 2 (splits): exige ao menos um lap; cada linha de variação exige ≥ 2
 *   laps com a métrica correspondente presente e positiva (uma variação entre
 *   um único ponto não existe);
 * - fonte 3 (séries): exige ≥ 2 amostras positivas da série — a categoria
 *   `endurance-pace` exibe FC e cadência, e nunca velocidade.
 */
function expectedComposition(spec: Scenario): ExpectedComposition {
  const zonesAvailable = spec.hasHeartRateStream && spec.hasMaxHeartRateReference;
  const splitsAvailable = spec.laps.length > 0;

  const splitLabels: string[] = [];

  if (splitsAvailable) {
    splitLabels.push(SPLIT_COUNT_LABEL);

    if (countPositive(spec.laps.map((lap) => lap.averageSpeed)) >= 2) {
      splitLabels.push(SPLIT_PACE_LABEL);
    }

    if (countPositive(spec.laps.map((lap) => lap.averageCadence)) >= 2) {
      splitLabels.push(SPLIT_CADENCE_LABEL);
    }

    if (countPositive(spec.laps.map((lap) => lap.averageHeartRate)) >= 2) {
      splitLabels.push(SPLIT_HEART_RATE_LABEL);
    }
  }

  const streamLabels: string[] = [];

  if (spec.hasHeartRateStream && countPositive(spec.heartRateValues) >= 2) {
    streamLabels.push(STREAM_HEART_RATE_LABEL);
  }

  if (spec.hasCadenceStream && countPositive(spec.cadenceValues) >= 2) {
    streamLabels.push(STREAM_CADENCE_LABEL);
  }

  const seriesAvailable = streamLabels.length > 0;

  return {
    zonesAvailable,
    splitsAvailable,
    seriesAvailable,
    splitLabels,
    streamLabels,
    sectionExpected: zonesAvailable || splitsAvailable || seriesAvailable,
  };
}

function workoutAnalysisMetrics(
  view: ActivityVisualData | null,
): ActivityMetricRow[] | null {
  const section = view?.metricSections.find(
    (candidate) => candidate.id === STRAVA_WORKOUT_ANALYSIS_SECTION_ID,
  );

  return section ? section.metrics : null;
}

function hasBarSection(view: ActivityVisualData | null, id: string): boolean {
  return Boolean(view?.barSections.some((section) => section.id === id));
}

async function runScenario(
  spec: Scenario,
  sportType = "run",
): Promise<ActivityVisualData | null> {
  // Cada cenário parte de cache limpo: o objeto de atividade é o mesmo (mesma
  // chave `id:updatedAt`), então uma entrada remanescente mascararia o
  // resultado seguinte.
  stravaActivityVisualCache.clear();

  return getStravaActivityVisualData(makeActivity(spec, sportType), {
    client: makeClient(spec),
    now: () => FIXED_NOW,
  });
}

/**
 * Asserção central: a seção existe se e somente se ao menos uma fonte está
 * disponível, e contém exatamente os sub-blocos das fontes presentes — na ordem
 * zonas → splits → séries, sem linha vazia, sem duplicata e sem rótulo de
 * métrica que a categoria não exibe.
 */
function assertComposition(
  spec: Scenario,
  view: ActivityVisualData | null,
): void {
  const expected = expectedComposition(spec);
  const metrics = workoutAnalysisMetrics(view);

  // Requisitos 6.1 e 6.4: presente se e somente se há fonte.
  expect(metrics !== null).toBe(expected.sectionExpected);

  if (metrics === null) {
    // Sem nenhuma fonte, o enriquecimento inteiro é dispensável (`null`) — a
    // visão base normalizada já basta.
    if (!expected.zonesAvailable && !expected.splitsAvailable) {
      expect(view).toBeNull();
    }
    return;
  }

  const labels = metrics.map((row) => row.label);
  const effortLabels = labels.filter((label) =>
    (EFFORT_LABELS as readonly string[]).includes(label),
  );

  // Sub-bloco 1: existe se e somente se a fonte de zonas existe, e só usa os
  // rótulos de esforço conhecidos, na ordem canônica leve → moderada → intensa.
  expect(effortLabels.length > 0).toBe(expected.zonesAvailable);
  expect(effortLabels).toEqual(
    EFFORT_LABELS.filter((label) => effortLabels.includes(label)),
  );

  // Requisitos 6.2 e 6.3: exatamente os sub-blocos das fontes presentes, na
  // ordem de composição, sem sub-bloco vazio nem linha de fonte ausente.
  expect(labels).toEqual([
    ...effortLabels,
    ...expected.splitLabels,
    ...expected.streamLabels,
  ]);
  expect(new Set(labels).size).toBe(labels.length);

  for (const forbidden of FORBIDDEN_LABELS) {
    expect(labels).not.toContain(forbidden);
  }

  for (const row of metrics) {
    // Nenhuma linha entra com placeholder de "sem dado" (Requisito 4.4).
    expect(row.value.trim().length).toBeGreaterThan(0);
    expect(row.value).not.toBe("—");
    expect(row.value).not.toMatch(/indispon/i);
  }

  for (const row of metrics) {
    if ((EFFORT_LABELS as readonly string[]).includes(row.label)) {
      expect(row.value).toMatch(/^\d{1,3}%$/);
      expect(Number.parseInt(row.value, 10)).toBeGreaterThan(0);
    }
  }

  const countRow = metrics.find((row) => row.label === SPLIT_COUNT_LABEL);

  if (expected.splitsAvailable) {
    expect(countRow?.value).toBe(String(spec.laps.length));
  } else {
    expect(countRow).toBeUndefined();
  }

  // As seções de barras das mesmas fontes acompanham a disponibilidade: nada de
  // seção de zonas sem stream de FC utilizável, nada de seção de splits sem lap.
  expect(hasBarSection(view, HEART_RATE_ZONES_SECTION_ID)).toBe(
    expected.zonesAvailable,
  );
  expect(hasBarSection(view, STRAVA_SPLITS_SECTION_ID)).toBe(
    expected.splitsAvailable,
  );
}

// ---------------------------------------------------------------------------
// Property 10
// ---------------------------------------------------------------------------

/**
 * Feature: detalhe-atividade-multi-provider, Property 10: A seção de análise do
 * treino reflete exatamente as fontes de dado disponíveis — para qualquer
 * combinação de disponibilidade das três fontes (zonas de FC, laps/splits,
 * streams), a seção de análise do treino está presente se e somente se ao menos
 * uma fonte estiver disponível, e contém exatamente os sub-blocos
 * correspondentes às fontes presentes (nenhum sub-bloco vazio, nenhum sub-bloco
 * de uma fonte ausente).
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 */
describe("getStravaActivityVisualData — composição da análise do treino (Property 10)", () => {
  beforeEach(() => {
    stravaActivityVisualCache.clear();
  });

  afterEach(() => {
    stravaActivityVisualCache.clear();
  });

  it("compõe a seção exatamente com os sub-blocos das fontes disponíveis", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (spec) => {
        const view = await runScenario(spec);

        assertComposition(spec, view);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("cobre as 8 combinações de disponibilidade das 3 fontes", async () => {
    /**
     * Cenários mínimos que realizam cada uma das 8 combinações
     * `(zonas, splits, séries)`.
     *
     * As duas combinações que separam zonas de séries usam a mesma borda de
     * dado real: um stream de FC com uma única leitura útil e o resto em `0`
     * (trecho sem sensor) rende zonas — o cálculo conta o tempo em recuperação —
     * mas não rende faixa de série, que exige ≥ 2 leituras positivas.
     */
    const singleUsefulHeartRateReading = [150, 0];
    const usableSeries = [150, 160, 170];
    const usableCadence = [80, 84, 88];
    const oneLap: LapSpec[] = [
      {
        elapsedTime: 300,
        distance: 1_000,
        averageSpeed: 3.3,
        averageCadence: 82,
        averageHeartRate: 150,
      },
    ];

    const combinations: {
      expected: [boolean, boolean, boolean];
      spec: Scenario;
    }[] = [
      {
        expected: [false, false, false],
        spec: {
          hasHeartRateStream: false,
          hasCadenceStream: false,
          hasMaxHeartRateReference: true,
          heartRateValues: [],
          cadenceValues: [],
          laps: [],
        },
      },
      {
        expected: [true, false, false],
        spec: {
          hasHeartRateStream: true,
          hasCadenceStream: false,
          hasMaxHeartRateReference: true,
          heartRateValues: singleUsefulHeartRateReading,
          cadenceValues: [],
          laps: [],
        },
      },
      {
        expected: [false, true, false],
        spec: {
          hasHeartRateStream: false,
          hasCadenceStream: false,
          hasMaxHeartRateReference: true,
          heartRateValues: [],
          cadenceValues: [],
          laps: oneLap,
        },
      },
      {
        expected: [false, false, true],
        spec: {
          hasHeartRateStream: false,
          hasCadenceStream: true,
          hasMaxHeartRateReference: true,
          heartRateValues: [],
          cadenceValues: usableCadence,
          laps: [],
        },
      },
      {
        expected: [true, true, false],
        spec: {
          hasHeartRateStream: true,
          hasCadenceStream: false,
          hasMaxHeartRateReference: true,
          heartRateValues: singleUsefulHeartRateReading,
          cadenceValues: [],
          laps: oneLap,
        },
      },
      {
        expected: [true, false, true],
        spec: {
          hasHeartRateStream: true,
          hasCadenceStream: false,
          hasMaxHeartRateReference: true,
          heartRateValues: usableSeries,
          cadenceValues: [],
          laps: [],
        },
      },
      {
        expected: [false, true, true],
        spec: {
          // Stream de FC presente, mas SEM FC máxima de referência: a série
          // aparece, as zonas não (Requisito 2.4-c).
          hasHeartRateStream: true,
          hasCadenceStream: false,
          hasMaxHeartRateReference: false,
          heartRateValues: usableSeries,
          cadenceValues: [],
          laps: oneLap,
        },
      },
      {
        expected: [true, true, true],
        spec: {
          hasHeartRateStream: true,
          hasCadenceStream: true,
          hasMaxHeartRateReference: true,
          heartRateValues: usableSeries,
          cadenceValues: usableCadence,
          laps: oneLap,
        },
      },
    ];

    const covered = new Set<string>();

    for (const { expected, spec } of combinations) {
      const composition = expectedComposition(spec);

      // O cenário realmente realiza a combinação anunciada (protege o teste de
      // virar tautologia se um gerador mudar).
      expect([
        composition.zonesAvailable,
        composition.splitsAvailable,
        composition.seriesAvailable,
      ]).toEqual(expected);

      const view = await runScenario(spec);

      assertComposition(spec, view);
      covered.add(expected.join("|"));
    }

    expect(covered.size).toBe(8);
  });

  it("não exibe a seção quando a categoria não tem análise do treino", async () => {
    // Nenhuma categoria do catálogo atual tem `workoutAnalysis: false` — todas
    // são "full"/"limited"/"effort-only". Para fixar a guarda de composição
    // (`if (!rules.workoutAnalysis) return null`), a regra da categoria é
    // sobrescrita temporariamente e restaurada em seguida.
    const original = METRIC_DISPLAY_RULES["endurance-pace"];

    METRIC_DISPLAY_RULES["endurance-pace"] = {
      ...original,
      workoutAnalysis: false,
    };

    try {
      const spec: Scenario = {
        hasHeartRateStream: true,
        hasCadenceStream: true,
        hasMaxHeartRateReference: true,
        heartRateValues: [140, 150, 165, 180],
        cadenceValues: [80, 84, 88, 90],
        laps: [
          {
            elapsedTime: 300,
            distance: 1_000,
            averageSpeed: 3.3,
            averageCadence: 82,
            averageHeartRate: 150,
          },
          {
            elapsedTime: 280,
            distance: 1_000,
            averageSpeed: 3.6,
            averageCadence: 85,
            averageHeartRate: 158,
          },
        ],
      };

      const view = await runScenario(spec);

      // Todas as três fontes existem, mas a categoria não admite a seção.
      expect(workoutAnalysisMetrics(view)).toBeNull();
      expect(view?.metricSections).toEqual([]);
      expect(hasBarSection(view, STRAVA_SPLITS_SECTION_ID)).toBe(false);
      // A seção de zonas segue sua própria regra (`heartRateZones`), intacta.
      expect(hasBarSection(view, HEART_RATE_ZONES_SECTION_ID)).toBe(true);
    } finally {
      METRIC_DISPLAY_RULES["endurance-pace"] = original;
      stravaActivityVisualCache.clear();
    }
  });
});
