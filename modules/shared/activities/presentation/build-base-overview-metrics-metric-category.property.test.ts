/**
 * Testes de propriedade da rotulagem/omissão de métricas por categoria de
 * exibição na visão base do detalhe de atividade.
 *
 * Feature: detalhe-atividade-multi-provider, Property 7: Rotulagem de
 * cadência/frequência de braçadas e formato de ritmo dependem só da categoria
 * de exibição de métricas.
 *
 * Feature: detalhe-atividade-multi-provider, Property 8: Categorias sem
 * cadência/ritmo nunca exibem essas métricas mesmo com dado bruto presente.
 *
 * **Validates: Requirements 4.1, 4.2, 4.5, 4.6, 5.1, 5.2, 5.5, 5.6**
 *
 * Estratégia: gerar `sportType` arbitrário (toda a taxonomia canônica, mais
 * valores fora dela) combinado com valores numéricos arbitrários de
 * cadência/ritmo/velocidade/potência, e verificar que a presença e o rótulo de
 * cada métrica condicional em `overviewMetrics` respeitam exatamente
 * `METRIC_DISPLAY_RULES[getMetricDisplayCategory(sportType)]`:
 *
 * - `pace === "pace-per-100m"` → linha "Ritmo médio" formatada por 100 m;
 * - `pace === "pace-per-km"` → linha "Pace médio" formatada por km;
 * - `pace === false` → nenhuma linha de ritmo/pace (Requisito 5.6);
 * - `cadenceOrStrokeRate === "stroke-rate"` → linha "Cadência de nado";
 * - `cadenceOrStrokeRate === "cadence"` → linha "Cadência";
 * - `cadenceOrStrokeRate === false` → nenhuma linha de cadência, mesmo com
 *   `averageCadence` bruto presente (Requisito 4.6);
 * - `speedFallback` governa "Velocidade média"/"Velocidade máx." e
 *   "Potência média"/"Potência máx.".
 *
 * Duas dimensões de invariância são varridas junto, porque os Requisitos 4.5 e
 * 5.5 exigem que a decisão venha da modalidade canônica e **nunca** do
 * provider de origem:
 *
 * - `provider` percorre todos os `ProviderId` do catálogo mais um identificador
 *   sintético de provider futuro: duas atividades com o mesmo `sportType` e
 *   providers diferentes devem produzir `overviewMetrics` idênticos;
 * - duas modalidades canônicas **distintas da mesma categoria** (ex.: `run` e
 *   `walking`) devem produzir `overviewMetrics` idênticos, o que é a forma
 *   forte de "depende só da categoria": nenhuma decisão pode vazar do
 *   `sportType` individual.
 *
 * Nota sobre velocidade zero: `buildBaseOverviewMetrics` converte a velocidade
 * de m/s para km/h com um teste de veracidade (`averageSpeed ? ... : null`),
 * de modo que `0` é indistinguível de ausência nessa linha. Os geradores de
 * velocidade usam valores estritamente positivos para que a propriedade
 * afirmada seja a de categoria/rotulagem, sem depender dessa ambiguidade —
 * que não é objeto desta tarefa.
 *
 * `buildBaseActivityVisualData` é puro e sem I/O, então nenhum mock é
 * necessário.
 */

import type { Activity } from "@prisma/client";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  formatCadence,
  formatPace,
  formatPower,
  formatSpeed,
  formatSwimPace,
} from "@/lib/format";
import type {
  MetricDisplayCategory,
  MetricDisplayRules,
} from "@/modules/shared/activities/metric-display-categories";
import {
  METRIC_DISPLAY_RULES,
  RYVANO_SPORT_TO_METRIC_CATEGORY,
  getMetricDisplayCategory,
} from "@/modules/shared/activities/metric-display-categories";
import type { ActivityMetricRow } from "@/modules/shared/activities/presentation/activity-visual-data";
import { buildBaseActivityVisualData } from "@/modules/shared/activities/presentation/get-activity-visual-data";
import type { RyvanoSportType } from "@/modules/shared/activities/sport-types";
import {
  RYVANO_SPORT_TYPES,
  isRyvanoSportType,
} from "@/modules/shared/activities/sport-types";
import { PROVIDERS } from "@/modules/shared/integrations/catalog";

const NUM_RUNS = 200;

const SWIM_PACE_LABEL = "Ritmo médio";
const RUN_PACE_LABEL = "Pace médio";
const STROKE_RATE_LABEL = "Cadência de nado";
const CADENCE_LABEL = "Cadência";
const AVERAGE_SPEED_LABEL = "Velocidade média";
const MAX_SPEED_LABEL = "Velocidade máx.";
const AVERAGE_POWER_LABEL = "Potência média";
const MAX_POWER_LABEL = "Potência máx.";

const PACE_LABELS = [SWIM_PACE_LABEL, RUN_PACE_LABEL] as const;
const CADENCE_LABELS = [STROKE_RATE_LABEL, CADENCE_LABEL] as const;
const SPEED_LABELS = [AVERAGE_SPEED_LABEL, MAX_SPEED_LABEL] as const;
const POWER_LABELS = [AVERAGE_POWER_LABEL, MAX_POWER_LABEL] as const;

// ---------------------------------------------------------------------------
// Expectativa (derivada do contrato, não da implementação)
// ---------------------------------------------------------------------------

/**
 * Regras esperadas para um `sportType` cru persistido em `Activity`.
 *
 * Reimplementa o contrato descrito nos Requisitos 4.5/5.5/12.3: normaliza a
 * string (trim + minúsculas), consulta a categoria quando o valor é canônico e
 * cai em `"default"` quando não é (modalidade desconhecida/legado, string
 * vazia ou `null`).
 */
function expectedRules(sportType: string | null): MetricDisplayRules {
  const raw = sportType?.trim();
  const key = raw ? raw.toLowerCase() : "default";
  const category: MetricDisplayCategory = isRyvanoSportType(key)
    ? getMetricDisplayCategory(key)
    : "default";

  return METRIC_DISPLAY_RULES[category];
}

/** Modalidades canônicas agrupadas por categoria de exibição de métricas. */
const SPORT_TYPES_BY_CATEGORY = RYVANO_SPORT_TYPES.reduce<
  Partial<Record<MetricDisplayCategory, RyvanoSportType[]>>
>((acc, sportType) => {
  const category = RYVANO_SPORT_TO_METRIC_CATEGORY[sportType];
  (acc[category] ??= []).push(sportType);
  return acc;
}, {});

const CATEGORIES_WITH_SPORT_TYPES = Object.keys(
  SPORT_TYPES_BY_CATEGORY,
) as MetricDisplayCategory[];

function sportTypesOfCategory(
  category: MetricDisplayCategory,
): readonly RyvanoSportType[] {
  return SPORT_TYPES_BY_CATEGORY[category] ?? [];
}

/** Categorias cujas regras satisfazem um predicado (ex.: sem cadência). */
function categoriesWhere(
  predicate: (rules: MetricDisplayRules) => boolean,
): readonly MetricDisplayCategory[] {
  return CATEGORIES_WITH_SPORT_TYPES.filter((category) =>
    predicate(METRIC_DISPLAY_RULES[category]),
  );
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const optionalMetric = (min: number, max: number): fc.Arbitrary<number | null> =>
  fc.option(fc.double({ min, max, noNaN: true }), { nil: null });

/** Ritmo em segundos (por km ou por 100 m, conforme a categoria). */
const paceValue = optionalMetric(0, 900);
/** Cadência bruta normalizada (rpm / braçadas por minuto). */
const cadenceValue = optionalMetric(0, 220);
/** Velocidade em m/s, estritamente positiva (ver nota sobre velocidade zero). */
const speedValue = optionalMetric(0.1, 30);
const powerValue = optionalMetric(0, 900);

/**
 * Modalidade: toda a taxonomia canônica, mais valores fora dela (desconhecido,
 * string vazia, variação com espaço/caixa alta) e `null` — todos os casos fora
 * da taxonomia devem cair na categoria `"default"`.
 */
const sportTypeValue: fc.Arbitrary<string | null> = fc.oneof(
  fc.constantFrom<string>(...RYVANO_SPORT_TYPES),
  fc.constantFrom("Modalidade Desconhecida", "underwater-chess", "", "RUN "),
  fc.constant(null),
);

const CATALOG_PROVIDER_IDS: readonly string[] = PROVIDERS.map(
  (provider) => provider.id,
);

/**
 * Origem: todos os providers do catálogo mais um identificador sintético de
 * provider futuro (sem módulo, sem capability declarada).
 */
const providerValue: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...CATALOG_PROVIDER_IDS),
  fc.string({ minLength: 1, maxLength: 8 }).map((suffix) => `FUTURE_${suffix}`),
);

interface GeneratedActivityFields {
  provider: string;
  sportType: string | null;
  averagePace: number | null;
  averageCadence: number | null;
  averageSpeed: number | null;
  maxSpeed: number | null;
  averagePower: number | null;
  maxPower: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  elevationGain: number | null;
}

const activityFields: fc.Arbitrary<GeneratedActivityFields> = fc.record({
  provider: providerValue,
  sportType: sportTypeValue,
  averagePace: paceValue,
  averageCadence: cadenceValue,
  averageSpeed: speedValue,
  maxSpeed: speedValue,
  averagePower: powerValue,
  maxPower: powerValue,
  durationSeconds: optionalMetric(0, 20_000),
  distanceMeters: optionalMetric(0, 200_000),
  calories: optionalMetric(0, 5_000),
  averageHeartRate: optionalMetric(0, 200),
  maxHeartRate: optionalMetric(0, 240),
  elevationGain: optionalMetric(0, 3_000),
});

/** Variante em que todos os dados brutos condicionais estão presentes. */
const activityFieldsWithAllRawMetrics: fc.Arbitrary<GeneratedActivityFields> =
  activityFields.chain((fields) =>
    fc.record({
      averagePace: fc.double({ min: 1, max: 900, noNaN: true }),
      averageCadence: fc.double({ min: 1, max: 220, noNaN: true }),
      averageSpeed: fc.double({ min: 0.1, max: 30, noNaN: true }),
      maxSpeed: fc.double({ min: 0.1, max: 30, noNaN: true }),
      averagePower: fc.double({ min: 1, max: 600, noNaN: true }),
      maxPower: fc.double({ min: 1, max: 900, noNaN: true }),
    }).map((rawMetrics) => ({ ...fields, ...rawMetrics })),
  );

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/**
 * Atividade no formato Prisma `Activity`, sem nenhum dado pessoal real. Só os
 * campos lidos pelo builder base importam; os demais ficam neutros.
 */
function makeActivity(fields: GeneratedActivityFields): Activity {
  return {
    id: "act_property_category",
    userId: "user_property",
    wearableConnectionId: "conn_property",
    externalId: "ext_property",
    providerSportType: null,
    name: "Atividade de teste",
    startedAt: new Date("2026-01-10T10:00:00.000Z"),
    endedAt: null,
    movingSeconds: null,
    timezone: null,
    metrics: null,
    rawPayload: null,
    createdAt: new Date("2026-01-10T10:30:00.000Z"),
    updatedAt: new Date("2026-01-10T10:30:00.000Z"),
    ...fields,
  } as unknown as Activity;
}

function overviewOf(fields: GeneratedActivityFields): ActivityMetricRow[] {
  return buildBaseActivityVisualData(makeActivity(fields)).overviewMetrics;
}

function rowsWithLabel(
  rows: readonly ActivityMetricRow[],
  label: string,
): ActivityMetricRow[] {
  return rows.filter((row) => row.label === label);
}

function labelsOf(rows: readonly ActivityMetricRow[]): string[] {
  return rows.map((row) => row.label);
}

function hasAnyLabel(
  rows: readonly ActivityMetricRow[],
  labels: readonly string[],
): boolean {
  return rows.some((row) => labels.includes(row.label));
}

/** Um `sportType` canônico por categoria, com ao menos duas alternativas. */
const categoryWithTwoSportTypes = fc
  .constantFrom(
    ...CATEGORIES_WITH_SPORT_TYPES.filter(
      (category) => sportTypesOfCategory(category).length >= 2,
    ),
  )
  .chain((category) => {
    const sportTypes = sportTypesOfCategory(category);
    return fc.tuple(
      fc.constantFrom<RyvanoSportType>(...sportTypes),
      fc.constantFrom<RyvanoSportType>(...sportTypes),
    );
  });

// ---------------------------------------------------------------------------
// Property 7
// ---------------------------------------------------------------------------

describe("buildBaseOverviewMetrics — rotulagem por categoria (Property 7)", () => {
  it("rotula cadência exatamente conforme rules.cadenceOrStrokeRate", () => {
    fc.assert(
      fc.property(activityFields, (fields) => {
        const rows = overviewOf(fields);
        const rules = expectedRules(fields.sportType);

        const strokeRateRows = rowsWithLabel(rows, STROKE_RATE_LABEL);
        const cadenceRows = rowsWithLabel(rows, CADENCE_LABEL);

        if (rules.cadenceOrStrokeRate === false) {
          expect(strokeRateRows).toHaveLength(0);
          expect(cadenceRows).toHaveLength(0);
          return;
        }

        const expectedLabel =
          rules.cadenceOrStrokeRate === "stroke-rate"
            ? STROKE_RATE_LABEL
            : CADENCE_LABEL;
        const forbiddenLabel =
          expectedLabel === STROKE_RATE_LABEL ? CADENCE_LABEL : STROKE_RATE_LABEL;

        expect(rowsWithLabel(rows, forbiddenLabel)).toHaveLength(0);

        const matches = rowsWithLabel(rows, expectedLabel);
        if (fields.averageCadence === null) {
          expect(matches).toHaveLength(0);
          return;
        }

        expect(matches).toHaveLength(1);
        expect(matches[0]!.value).toBe(formatCadence(fields.averageCadence));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("formata ritmo/pace exatamente conforme rules.pace", () => {
    fc.assert(
      fc.property(activityFields, (fields) => {
        const rows = overviewOf(fields);
        const rules = expectedRules(fields.sportType);

        if (rules.pace === false) {
          expect(rowsWithLabel(rows, SWIM_PACE_LABEL)).toHaveLength(0);
          expect(rowsWithLabel(rows, RUN_PACE_LABEL)).toHaveLength(0);
          return;
        }

        const isSwimPace = rules.pace === "pace-per-100m";
        const expectedLabel = isSwimPace ? SWIM_PACE_LABEL : RUN_PACE_LABEL;
        const forbiddenLabel = isSwimPace ? RUN_PACE_LABEL : SWIM_PACE_LABEL;

        expect(rowsWithLabel(rows, forbiddenLabel)).toHaveLength(0);

        const matches = rowsWithLabel(rows, expectedLabel);
        if (fields.averagePace === null) {
          expect(matches).toHaveLength(0);
          return;
        }

        expect(matches).toHaveLength(1);
        expect(matches[0]!.value).toBe(
          isSwimPace
            ? formatSwimPace(fields.averagePace)
            : formatPace(fields.averagePace),
        );
        // O formato é o da categoria, não o do dado: por 100 m na natação,
        // por km na resistência com ritmo (Requisitos 5.1, 5.2).
        expect(matches[0]!.value).toContain(isSwimPace ? "/100 m" : "/km");
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("exibe velocidade e potência apenas nas categorias com speedFallback", () => {
    fc.assert(
      fc.property(activityFields, (fields) => {
        const rows = overviewOf(fields);
        const rules = expectedRules(fields.sportType);

        if (!rules.speedFallback) {
          expect(hasAnyLabel(rows, SPEED_LABELS)).toBe(false);
          expect(hasAnyLabel(rows, POWER_LABELS)).toBe(false);
          return;
        }

        expect(rowsWithLabel(rows, AVERAGE_SPEED_LABEL).length === 1).toBe(
          fields.averageSpeed !== null,
        );
        expect(rowsWithLabel(rows, MAX_SPEED_LABEL).length === 1).toBe(
          fields.maxSpeed !== null,
        );
        expect(rowsWithLabel(rows, AVERAGE_POWER_LABEL).length === 1).toBe(
          fields.averagePower !== null,
        );
        expect(rowsWithLabel(rows, MAX_POWER_LABEL).length === 1).toBe(
          fields.maxPower !== null,
        );

        if (fields.averageSpeed !== null) {
          expect(rowsWithLabel(rows, AVERAGE_SPEED_LABEL)[0]!.value).toBe(
            formatSpeed(fields.averageSpeed * 3.6),
          );
        }
        if (fields.averagePower !== null) {
          expect(rowsWithLabel(rows, AVERAGE_POWER_LABEL)[0]!.value).toBe(
            formatPower(fields.averagePower),
          );
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("não depende do provider de origem: mesmo sportType e providers diferentes produzem o mesmo resumo", () => {
    fc.assert(
      fc.property(
        activityFields,
        providerValue,
        providerValue,
        (fields, firstProvider, secondProvider) => {
          expect(overviewOf({ ...fields, provider: firstProvider })).toEqual(
            overviewOf({ ...fields, provider: secondProvider }),
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("depende só da categoria: modalidades distintas da mesma categoria produzem o mesmo resumo", () => {
    fc.assert(
      fc.property(
        activityFields,
        categoryWithTwoSportTypes,
        (fields, [firstSportType, secondSportType]) => {
          expect(overviewOf({ ...fields, sportType: firstSportType })).toEqual(
            overviewOf({ ...fields, sportType: secondSportType }),
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("modalidades fora da taxonomia canônica caem na categoria default (sem ritmo, cadência, velocidade ou potência)", () => {
    const nonCanonicalSportType = fc.oneof(
      fc.constantFrom("Modalidade Desconhecida", "underwater-chess", "", "  "),
      fc.constant(null),
      fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((value) => !isRyvanoSportType(value.trim().toLowerCase())),
    );

    fc.assert(
      fc.property(
        activityFieldsWithAllRawMetrics,
        nonCanonicalSportType,
        (fields, sportType) => {
          const rows = overviewOf({ ...fields, sportType });

          expect(hasAnyLabel(rows, PACE_LABELS)).toBe(false);
          expect(hasAnyLabel(rows, CADENCE_LABELS)).toBe(false);
          expect(hasAnyLabel(rows, SPEED_LABELS)).toBe(false);
          expect(hasAnyLabel(rows, POWER_LABELS)).toBe(false);
          // Omissão graciosa: o resumo continua existindo com as linhas
          // genéricas (Requisito 12.3).
          expect(rows.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8
// ---------------------------------------------------------------------------

describe("buildBaseOverviewMetrics — categorias sem cadência/ritmo (Property 8)", () => {
  const categoriesWithoutCadence = categoriesWhere(
    (rules) => rules.cadenceOrStrokeRate === false,
  );
  const categoriesWithoutPace = categoriesWhere((rules) => rules.pace === false);

  const sportTypeOfCategories = (
    categories: readonly MetricDisplayCategory[],
  ): fc.Arbitrary<RyvanoSportType> =>
    fc
      .constantFrom(...categories)
      .chain((category) =>
        fc.constantFrom<RyvanoSportType>(...sportTypesOfCategory(category)),
      );

  it("nunca exibe cadência/frequência de braçadas quando a categoria não permite, mesmo com averageCadence presente", () => {
    fc.assert(
      fc.property(
        activityFieldsWithAllRawMetrics,
        sportTypeOfCategories(categoriesWithoutCadence),
        (fields, sportType) => {
          const rows = overviewOf({ ...fields, sportType });

          expect(fields.averageCadence).not.toBeNull();
          expect(hasAnyLabel(rows, CADENCE_LABELS)).toBe(false);
          // Nenhum rótulo fabricado com o valor bruto de cadência.
          expect(
            rows.some((row) =>
              row.value === formatCadence(fields.averageCadence),
            ),
          ).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("nunca exibe ritmo/pace quando a categoria não permite, mesmo com averagePace e averageSpeed presentes", () => {
    fc.assert(
      fc.property(
        activityFieldsWithAllRawMetrics,
        sportTypeOfCategories(categoriesWithoutPace),
        (fields, sportType) => {
          const rows = overviewOf({ ...fields, sportType });

          expect(fields.averagePace).not.toBeNull();
          expect(fields.averageSpeed).not.toBeNull();
          expect(hasAnyLabel(rows, PACE_LABELS)).toBe(false);
          expect(labelsOf(rows).some((label) => /ritmo|pace/i.test(label))).toBe(
            false,
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("categorias sem ritmo e sem speedFallback não exibem nem ritmo nem velocidade/potência", () => {
    const categoriesWithoutPaceAndSpeed = categoriesWhere(
      (rules) => rules.pace === false && !rules.speedFallback,
    );

    fc.assert(
      fc.property(
        activityFieldsWithAllRawMetrics,
        sportTypeOfCategories(categoriesWithoutPaceAndSpeed),
        (fields, sportType) => {
          const rows = overviewOf({ ...fields, sportType });

          expect(hasAnyLabel(rows, PACE_LABELS)).toBe(false);
          expect(hasAnyLabel(rows, SPEED_LABELS)).toBe(false);
          expect(hasAnyLabel(rows, POWER_LABELS)).toBe(false);
          expect(rows.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
