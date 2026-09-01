/**
 * Feature: detalhe-atividade-multi-provider, Property 9: Ausência de dado
 * específico de modalidade é omissão graciosa, nunca erro/zero/mensagem de
 * indisponibilidade.
 *
 * **Validates: Requirements 4.4**
 *
 * Espaço de entrada varrido (Tarefa 17.5): para modalidades de várias categorias
 * de exibição de métricas — incluindo natação, o caso citado pelo requisito (o
 * Strava não expõe frequência de braçadas como o Garmin) — varre-se
 * independentemente
 *
 * - quais streams a resposta traz (`absent`), quais traz com amostras
 *   utilizáveis (`usable`) e quais traz **presentes mas zerados**
 *   (`flat-zero`, o caso real de sensor parado que produziria o "0 enganoso");
 * - quantas voltas o provider devolve e, por volta, quais métricas vêm nulas;
 * - quais campos agregados da atividade normalizada estão ausentes.
 *
 * E se verifica, para toda combinação, que o enriquecimento:
 *
 * 1. nunca lança;
 * 2. nunca emite linha/barra com `"—"`, string vazia ou valor cujos números
 *    sejam todos zero (o "valor zerado enganoso" do Requisito 4.4);
 * 3. nunca emite texto de indisponibilidade ("indisponível", "sem dados", …)
 *    que sugira falha;
 * 4. simplesmente **omite** o sub-bloco da fonte ausente — sem seção vazia,
 *    sem sub-bloco de fonte que não existe.
 *
 * Direção da propriedade: esta é a direção **ausência ⇒ omissão**. Que a seção
 * esteja presente quando a fonte existe (e com exatamente os sub-blocos
 * correspondentes) é a Property 10, coberta pela Tarefa 17.4 — aqui não se
 * afirma nada sobre presença, de modo que os dois testes não se sobrepõem.
 *
 * Escopo do check de zero: os itens da seção de zonas de FC
 * (`HEART_RATE_ZONES_SECTION_ID`) ficam fora dele. As 5 faixas são a
 * representação de uma fonte **presente** — uma faixa com `0s · 0%` é a leitura
 * factual de "nenhum tempo nessa faixa", não uma métrica ausente exibida como
 * zero. Todo o resto (herói, resumo, splits, análise do treino) entra no check.
 *
 * O client é injetado (`options.client`), então nenhuma rede é tocada e nenhum
 * caminho de falha é exercitado aqui — falha de rede/validação é a Property 13
 * (Tarefa 16.2). O cache é limpo a cada execução para que cada combinação seja
 * avaliada de verdade.
 */

import type { Activity } from "@prisma/client";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { HEART_RATE_ZONES_SECTION_ID } from "@/modules/shared/activities/heart-rate-zones";
import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";
import type { StravaClient } from "@/modules/strava/api/client";
import type { StravaLapDto } from "@/modules/strava/api/dto/strava-lap";
import type { StravaStreamSetObjectDto } from "@/modules/strava/api/dto/strava-stream";
import { stravaLapListSchema } from "@/modules/strava/api/schemas/strava-lap";
import { stravaStreamSetObjectSchema } from "@/modules/strava/api/schemas/strava-stream";
import {
  STRAVA_SPLITS_SECTION_ID,
  getStravaActivityVisualData,
  stravaActivityVisualCache,
} from "@/modules/strava/application/activities/strava-activity-details";

const NUM_RUNS = 120;

// ---------------------------------------------------------------------------
// Streams: plano de disponibilidade e DTO correspondente
// ---------------------------------------------------------------------------

/** Streams numéricos que o detalhe pede ao Strava. */
const NUMERIC_STREAM_TYPES = [
  "time",
  "distance",
  "heartrate",
  "cadence",
  "watts",
  "velocity_smooth",
  "altitude",
] as const;

type NumericStreamType = (typeof NUMERIC_STREAM_TYPES)[number];

/**
 * Como cada stream aparece na resposta:
 * - `absent`: a chave não vem (a atividade não tem aquele sensor);
 * - `usable`: vem com amostras positivas e plausíveis;
 * - `flat-zero`: vem presente, mas com todas as amostras em `0` — o caso real de
 *   sensor sem leitura, que não pode virar mínimo de faixa nem valor exibido.
 */
type StreamAvailability = "absent" | "usable" | "flat-zero";

/**
 * Plano de streams de UMA resposta.
 *
 * `sampleCount` é compartilhado por todos os streams presentes porque é assim
 * que a API do Strava responde: os streams pedidos de uma mesma atividade
 * compartilham comprimento e índice (o índice `i` de `heartrate` é o mesmo
 * instante do índice `i` de `time`) — contrato já documentado em
 * `parse-strava-streams.ts`. Gerar comprimentos independentes produziria séries
 * que a API nunca devolve.
 */
interface StreamPlan {
  sampleCount: number;
  availability: Record<NumericStreamType, StreamAvailability>;
}

/**
 * Faixas plausíveis por tipo de stream. Valores realistas de propósito: o alvo
 * da propriedade é a **combinação de ausências**, não o arredondamento de
 * valores fisicamente improváveis (uma velocidade de 0,01 m/s exibiria
 * "0,0 km/h" por arredondamento, o que não é o zero enganoso de que fala o
 * Requisito 4.4).
 */
const USABLE_STREAM_VALUE_RANGES: Record<
  NumericStreamType,
  readonly [number, number]
> = {
  time: [0, 3_600],
  distance: [50, 5_000],
  heartrate: [95, 195],
  cadence: [45, 190],
  watts: [90, 380],
  velocity_smooth: [1, 11],
  altitude: [10, 480],
};

const streamAvailabilityArb: fc.Arbitrary<StreamAvailability> =
  fc.constantFrom<StreamAvailability>("absent", "usable", "flat-zero");

const streamPlanArb: fc.Arbitrary<StreamPlan> = fc.record({
  sampleCount: fc.integer({ min: 1, max: 8 }),
  availability: fc.record({
    time: streamAvailabilityArb,
    distance: streamAvailabilityArb,
    heartrate: streamAvailabilityArb,
    cadence: streamAvailabilityArb,
    watts: streamAvailabilityArb,
    velocity_smooth: streamAvailabilityArb,
    altitude: streamAvailabilityArb,
  }),
});

/** Plano em que nenhum stream vem na resposta. */
const EMPTY_STREAM_PLAN: StreamPlan = {
  sampleCount: 0,
  availability: {
    time: "absent",
    distance: "absent",
    heartrate: "absent",
    cadence: "absent",
    watts: "absent",
    velocity_smooth: "absent",
    altitude: "absent",
  },
};

/** Amostras utilizáveis: rampa dentro da faixa plausível do tipo. */
function rampValues(type: NumericStreamType, count: number): number[] {
  const [min, max] = USABLE_STREAM_VALUE_RANGES[type];

  if (count === 1) {
    return [max];
  }

  return Array.from({ length: count }, (_, index) =>
    Math.round(min + ((max - min) * index) / (count - 1)),
  );
}

/**
 * Monta o `StreamSet` indexado por tipo e o valida com o schema Zod real, para
 * que o dublê do client devolva exatamente a forma que o client real devolveria.
 */
function buildStreamSetDto(plan: StreamPlan): StravaStreamSetObjectDto {
  const raw: Record<string, unknown> = {};

  for (const type of NUMERIC_STREAM_TYPES) {
    const availability = plan.availability[type];

    if (availability === "absent") {
      continue;
    }

    const data =
      availability === "flat-zero"
        ? new Array<number>(plan.sampleCount).fill(0)
        : rampValues(type, plan.sampleCount);

    raw[type] = {
      type,
      data,
      series_type: "time",
      original_size: data.length,
      resolution: "high",
    };
  }

  const validation = stravaStreamSetObjectSchema.safeParse(raw);

  expect(validation.success).toBe(true);

  if (!validation.success) {
    throw validation.error;
  }

  return validation.data;
}

/** Amostras positivas e finitas de um stream — o que a composição pode usar. */
function usableSampleCount(plan: StreamPlan, type: NumericStreamType): number {
  return plan.availability[type] === "usable" ? plan.sampleCount : 0;
}

/** Amostras finitas de FC (inclui as zeradas: `0` é finito e vira amostra). */
function heartRateSampleCount(plan: StreamPlan): number {
  return plan.availability.heartrate === "absent" ? 0 : plan.sampleCount;
}

// ---------------------------------------------------------------------------
// Laps: plano de disponibilidade e DTO correspondente
// ---------------------------------------------------------------------------

/** Quais métricas a volta traz; as demais vêm nulas (sensor ausente). */
interface LapSpec {
  hasDuration: boolean;
  hasDistance: boolean;
  hasSpeed: boolean;
  hasHeartRate: boolean;
  hasCadence: boolean;
  hasWatts: boolean;
}

const lapSpecArb: fc.Arbitrary<LapSpec> = fc.record({
  hasDuration: fc.boolean(),
  hasDistance: fc.boolean(),
  hasSpeed: fc.boolean(),
  hasHeartRate: fc.boolean(),
  hasCadence: fc.boolean(),
  hasWatts: fc.boolean(),
});

/** Inclui a atividade sem voltas nenhuma (lista vazia). */
const lapPlanArb: fc.Arbitrary<LapSpec[]> = fc.array(lapSpecArb, {
  maxLength: 6,
});

/**
 * Monta a lista de voltas e a valida com o schema Zod real. Os valores presentes
 * são plausíveis e crescentes entre voltas, para que exista variação real a
 * relatar quando a métrica existir em duas ou mais voltas.
 */
function buildLapDtos(plan: readonly LapSpec[]): StravaLapDto[] {
  const raw = plan.map((spec, index) => ({
    id: 1_000 + index,
    lap_index: index + 1,
    elapsed_time: spec.hasDuration ? 240 + index * 30 : null,
    distance: spec.hasDistance ? 400 + index * 100 : null,
    average_speed: spec.hasSpeed ? 1.2 + index * 0.4 : null,
    average_heartrate: spec.hasHeartRate ? 128 + index * 4 : null,
    average_cadence: spec.hasCadence ? 62 + index * 3 : null,
    average_watts: spec.hasWatts ? 160 + index * 12 : null,
  }));

  const validation = stravaLapListSchema.safeParse(raw);

  expect(validation.success).toBe(true);

  if (!validation.success) {
    throw validation.error;
  }

  return validation.data;
}

/** Quantas voltas trazem a métrica indicada (o que habilita uma faixa/variação). */
function lapsWith(
  plan: readonly LapSpec[],
  pick: (spec: LapSpec) => boolean,
): number {
  return plan.filter(pick).length;
}

// ---------------------------------------------------------------------------
// Atividade normalizada
// ---------------------------------------------------------------------------

/**
 * Modalidades de várias categorias de exibição de métricas: natação (o caso do
 * requisito), resistência com ritmo, ciclismo, remo/prancha, vento e vela, força
 * e estúdio, coletivos/raquete, neve e aventura, multiesporte, e um valor não
 * canônico (categoria `default`).
 */
const sportTypeArb: fc.Arbitrary<string> = fc.constantFrom(
  "swim",
  "open-water",
  "run",
  "trail-run",
  "bike",
  "rowing",
  "stand-up-paddle",
  "surf",
  "gym",
  "football",
  "alpine-ski",
  "triathlon",
  "modalidade_do_futuro",
);

const swimSportTypeArb: fc.Arbitrary<string> = fc.constantFrom(
  "swim",
  "open-water",
);

/**
 * Campos agregados opcionais, cada um ausente (`null`) de forma independente.
 * Todos os valores presentes são estritamente positivos e não minúsculos: assim,
 * qualquer valor exibido cujos números sejam todos zero denuncia um dado
 * fabricado, não um arredondamento legítimo.
 */
interface AggregateFields {
  durationSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averagePace: number | null;
  averageSpeed: number | null;
  maxSpeed: number | null;
  elevationGain: number | null;
  averageCadence: number | null;
  averagePower: number | null;
  maxPower: number | null;
}

const optionalPositive = (
  min: number,
  max: number,
): fc.Arbitrary<number | null> =>
  fc.option(fc.integer({ min, max }), { nil: null });

const aggregateFieldsArb: fc.Arbitrary<AggregateFields> = fc.record({
  durationSeconds: optionalPositive(600, 7_200),
  distanceMeters: optionalPositive(500, 20_000),
  calories: optionalPositive(120, 1_200),
  // FC média sempre abaixo da faixa da FC máxima: quando ambas existem, a FC
  // máxima é referência válida (Requisito 2.4-a).
  averageHeartRate: optionalPositive(95, 145),
  maxHeartRate: optionalPositive(155, 205),
  averagePace: optionalPositive(90, 600),
  averageSpeed: optionalPositive(2, 12),
  maxSpeed: optionalPositive(3, 15),
  elevationGain: optionalPositive(15, 1_200),
  averageCadence: optionalPositive(45, 190),
  averagePower: optionalPositive(90, 380),
  maxPower: optionalPositive(120, 450),
});

function makeActivity(sportType: string, fields: AggregateFields): Activity {
  return {
    id: "strava-activity-under-test",
    userId: "user-under-test",
    wearableConnectionId: "connection-under-test",
    externalId: "9876543210",
    provider: "STRAVA",
    providerSportType: sportType,
    sportType,
    name: null,
    startedAt: new Date("2026-03-02T06:30:00.000Z"),
    endedAt: null,
    movingSeconds: null,
    timezone: null,
    metrics: null,
    rawPayload: null,
    createdAt: new Date("2026-03-02T07:00:00.000Z"),
    updatedAt: new Date("2026-03-02T07:00:00.000Z"),
    ...fields,
  } as unknown as Activity;
}

/** Há FC máxima de referência para as zonas calculadas (Requisito 2.4). */
function hasMaxHeartRateReference(activity: Activity): boolean {
  const { maxHeartRate, averageHeartRate } = activity;

  return (
    typeof maxHeartRate === "number" &&
    (typeof averageHeartRate !== "number" || maxHeartRate > averageHeartRate)
  );
}

// ---------------------------------------------------------------------------
// Dublê do client (nenhuma rede; nenhum caminho de falha)
// ---------------------------------------------------------------------------

function fakeClient(
  streams: StravaStreamSetObjectDto,
  laps: StravaLapDto[],
): StravaClient {
  return {
    getActivityStreams: async () => streams,
    getActivityLaps: async () => laps,
  } as unknown as StravaClient;
}

async function enrich(
  activity: Activity,
  streams: StravaStreamSetObjectDto,
  laps: StravaLapDto[],
): Promise<ActivityVisualData | null> {
  // Cada combinação precisa ser realmente avaliada: as atividades geradas
  // compartilham `id`/`updatedAt`, então o cache é limpo antes de cada chamada.
  stravaActivityVisualCache.clear();

  return getStravaActivityVisualData(activity, {
    client: fakeClient(streams, laps),
    now: () => 0,
  });
}

// ---------------------------------------------------------------------------
// Inspeção do resultado
// ---------------------------------------------------------------------------

/** Uma linha/barra exibível, com a seção de origem. */
interface DisplayedEntry {
  sectionId: string;
  label: string;
  value: string;
}

function collectEntries(view: ActivityVisualData | null): DisplayedEntry[] {
  if (!view) {
    return [];
  }

  return [
    ...view.heroStats.map((stat) => ({
      sectionId: "hero",
      label: stat.label,
      value: stat.value,
    })),
    ...view.overviewMetrics.map((row) => ({
      sectionId: "overview",
      label: row.label,
      value: row.value,
    })),
    ...view.barSections.flatMap((section) =>
      section.items.map((item) => ({
        sectionId: section.id,
        label: item.label,
        value: item.valueText,
      })),
    ),
    ...view.metricSections.flatMap((section) =>
      section.metrics.map((row) => ({
        sectionId: section.id,
        label: row.label,
        value: row.value,
      })),
    ),
  ];
}

/** Todo texto exibido ao usuário (rótulos, valores, títulos, descrições, avisos). */
function collectProse(view: ActivityVisualData | null): string[] {
  if (!view) {
    return [];
  }

  const sectionProse = [
    ...view.barSections.flatMap((section) => [
      section.title,
      section.description,
      section.disclaimer ?? "",
    ]),
    ...view.metricSections.flatMap((section) => [
      section.title,
      section.description,
    ]),
  ];

  return [
    ...collectEntries(view).flatMap((entry) => [entry.label, entry.value]),
    ...sectionProse,
  ];
}

/** Placeholder de valor ausente usado pelos formatadores (em dash, U+2014). */
const MISSING_VALUE_PLACEHOLDER = "—";

/** Só traços/espaços: um placeholder visível disfarçado. */
function isDashOnly(value: string): boolean {
  return value.replace(/[\s\u2013\u2014-]/g, "").length === 0;
}

/**
 * Valor cujos números são TODOS zero ("0s", "0 rpm", "0,0 km/h", "0:00 /km") —
 * o "valor zerado enganoso" que o Requisito 4.4 proíbe para dado ausente. Uma
 * faixa como `0:45 /100 m` não é zerada (tem números diferentes de zero).
 */
function isAllZeroNumbers(value: string): boolean {
  const numbers = value.match(/\d+(?:[.,]\d+)?/g);

  if (!numbers) {
    return false;
  }

  return numbers.every((raw) => Number(raw.replace(",", ".")) === 0);
}

/** Texto que sugere falha/recurso indisponível (proibido pelo Requisito 4.4). */
const UNAVAILABILITY_PATTERN =
  /indispon|n[ãa]o dispon|sem dados|sem informa|not available|unavailable|falha|erro/i;

/** Rótulo de uma série do treino de cadência/frequência de braçadas. */
const STROKE_OR_CADENCE_SERIES_PATTERN =
  /(cad[êe]ncia|frequ[êe]ncia de bra[çc]adas) ao longo do treino/i;

/** Rótulo da variação de cadência/frequência de braçadas entre voltas/splits. */
const STROKE_OR_CADENCE_VARIATION_PATTERN =
  /varia[çc][ãa]o (de cad[êe]ncia|da frequ[êe]ncia de bra[çc]adas)/i;

/** Qualquer menção a cadência/braçadas (usado no cenário de natação). */
const ANY_STROKE_OR_CADENCE_PATTERN = /cad[êe]ncia|bra[çc]ada/i;

function labels(view: ActivityVisualData | null): string[] {
  return collectEntries(view).map((entry) => entry.label);
}

function hasBarSection(view: ActivityVisualData | null, id: string): boolean {
  return (view?.barSections ?? []).some((section) => section.id === id);
}

function hasLabel(
  view: ActivityVisualData | null,
  matcher: RegExp | string,
): boolean {
  return labels(view).some((label) =>
    typeof matcher === "string" ? label === matcher : matcher.test(label),
  );
}

/**
 * Invariantes que valem para QUALQUER combinação de ausências: nada de
 * placeholder, nada de zero enganoso, nada de mensagem de indisponibilidade e
 * nenhuma seção vazia.
 */
function expectGracefulOmission(view: ActivityVisualData | null): void {
  for (const entry of collectEntries(view)) {
    expect(entry.value).not.toBe(MISSING_VALUE_PLACEHOLDER);
    expect(entry.value.trim().length).toBeGreaterThan(0);
    expect(isDashOnly(entry.value)).toBe(false);
    expect(entry.label.trim().length).toBeGreaterThan(0);

    // As 5 faixas de zonas representam uma fonte presente: uma faixa sem tempo
    // é leitura factual ("0% do treino nessa faixa"), não métrica ausente.
    if (entry.sectionId !== HEART_RATE_ZONES_SECTION_ID) {
      expect(isAllZeroNumbers(entry.value)).toBe(false);
    }
  }

  for (const text of collectProse(view)) {
    expect(UNAVAILABILITY_PATTERN.test(text)).toBe(false);
  }

  for (const section of view?.barSections ?? []) {
    expect(section.items.length).toBeGreaterThan(0);
  }

  for (const section of view?.metricSections ?? []) {
    expect(section.metrics.length).toBeGreaterThan(0);
  }
}

// ---------------------------------------------------------------------------
// Ruído de log: o enriquecimento emite eventos estruturados a cada chamada
// ---------------------------------------------------------------------------

const consoleSpies: Array<{ mockRestore: () => void }> = [];

beforeAll(() => {
  consoleSpies.push(
    vi.spyOn(console, "log").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
  );
});

afterAll(() => {
  for (const spy of consoleSpies) {
    spy.mockRestore();
  }

  stravaActivityVisualCache.clear();
});

// ---------------------------------------------------------------------------
// Property 9
// ---------------------------------------------------------------------------

describe("getStravaActivityVisualData sem dado específico da modalidade (Property 9)", () => {
  it("omite o sub-bloco da fonte ausente sem lançar, sem zero enganoso e sem aviso de indisponibilidade", async () => {
    await fc.assert(
      fc.asyncProperty(
        sportTypeArb,
        aggregateFieldsArb,
        streamPlanArb,
        lapPlanArb,
        async (sportType, fields, streamPlan, lapPlan) => {
          const activity = makeActivity(sportType, fields);
          const view = await enrich(
            activity,
            buildStreamSetDto(streamPlan),
            buildLapDtos(lapPlan),
          );

          expectGracefulOmission(view);

          // Zonas de FC: sem série de FC ou sem FC máxima de referência, a seção
          // simplesmente não existe (Requisitos 2.4-c, 2.6).
          if (
            heartRateSampleCount(streamPlan) === 0 ||
            !hasMaxHeartRateReference(activity)
          ) {
            expect(hasBarSection(view, HEART_RATE_ZONES_SECTION_ID)).toBe(false);
          }

          // Séries do treino: uma faixa exige duas amostras utilizáveis. Stream
          // ausente OU presente-mas-zerado não produz linha alguma.
          if (usableSampleCount(streamPlan, "heartrate") < 2) {
            expect(hasLabel(view, "FC ao longo do treino")).toBe(false);
          }

          if (usableSampleCount(streamPlan, "cadence") < 2) {
            expect(hasLabel(view, STROKE_OR_CADENCE_SERIES_PATTERN)).toBe(false);
          }

          if (usableSampleCount(streamPlan, "velocity_smooth") < 2) {
            expect(hasLabel(view, "Velocidade ao longo do treino")).toBe(false);
          }

          // Splits/voltas: sem laps, nenhuma barra e nenhuma linha derivada.
          if (lapPlan.length === 0) {
            expect(hasBarSection(view, STRAVA_SPLITS_SECTION_ID)).toBe(false);
            expect(hasLabel(view, /volta|split/i)).toBe(false);
          }

          // Variações entre voltas: exigem a métrica em duas ou mais voltas.
          if (lapsWith(lapPlan, (spec) => spec.hasCadence) < 2) {
            expect(hasLabel(view, STROKE_OR_CADENCE_VARIATION_PATTERN)).toBe(
              false,
            );
          }

          if (lapsWith(lapPlan, (spec) => spec.hasSpeed) < 2) {
            expect(hasLabel(view, /varia[çc][ãa]o de (ritmo|velocidade)/i)).toBe(
              false,
            );
          }

          if (lapsWith(lapPlan, (spec) => spec.hasHeartRate) < 2) {
            expect(hasLabel(view, /varia[çc][ãa]o de FC/i)).toBe(false);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("natação sem frequência de braçadas não exibe a métrica em lugar algum", async () => {
    await fc.assert(
      fc.asyncProperty(
        swimSportTypeArb,
        aggregateFieldsArb,
        streamPlanArb,
        lapPlanArb,
        async (sportType, fields, streamPlan, lapPlan) => {
          // O cenário do Requisito 4.4: natação cujo provider não expõe
          // frequência de braçadas — nem stream de cadência, nem cadência nas
          // voltas, nem cadência agregada normalizada.
          const activity = makeActivity(sportType, {
            ...fields,
            averageCadence: null,
          });
          const streams = buildStreamSetDto({
            ...streamPlan,
            availability: { ...streamPlan.availability, cadence: "absent" },
          });
          const laps = buildLapDtos(
            lapPlan.map((spec) => ({ ...spec, hasCadence: false })),
          );

          const view = await enrich(activity, streams, laps);

          expectGracefulOmission(view);

          for (const text of collectProse(view)) {
            expect(ANY_STROKE_OR_CADENCE_PATTERN.test(text)).toBe(false);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("sem nenhuma fonte rica devolve null, deixando a visão base intacta", async () => {
    await fc.assert(
      fc.asyncProperty(
        sportTypeArb,
        aggregateFieldsArb,
        async (sportType, fields) => {
          const activity = makeActivity(sportType, fields);
          const view = await enrich(
            activity,
            buildStreamSetDto(EMPTY_STREAM_PLAN),
            [],
          );

          expect(view).toBeNull();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
