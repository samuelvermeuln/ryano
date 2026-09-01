/**
 * Testes de propriedade das métricas agregadas de frequência cardíaca na visão
 * base do detalhe de atividade.
 *
 * Feature: detalhe-atividade-multi-provider, Property 6: Métricas agregadas de
 * FC aparecem se e somente se os dados normalizados existem.
 *
 * **Validates: Requirements 3.1, 3.3**
 *
 * Estratégia: gerar atividades normalizadas variando, de forma **independente**,
 * a presença de `averageHeartRate` e de `maxHeartRate` (Requisitos 3.1 e 3.3),
 * e verificar que `overviewMetrics` contém a linha "FC média" se e somente se
 * `averageHeartRate` estiver presente, e "FC máxima" se e somente se
 * `maxHeartRate` estiver presente.
 *
 * Duas dimensões extra são varridas junto, porque a regra do Requisito 3.1 é
 * explicitamente "independentemente do provider de origem" e as duas linhas de
 * FC não pertencem a nenhuma categoria de exibição de métricas em particular:
 *
 * - `sportType` percorre toda a taxonomia canônica (`RYVANO_SPORT_TYPES`) mais
 *   valores fora da taxonomia (modalidade desconhecida/legado e `null`), que
 *   caem na categoria `"default"`. Se as linhas de FC passassem a depender da
 *   categoria de exibição de métricas (como pace e cadência dependem), os casos
 *   de `strength-studio`/`team-racket`/`default` falhariam aqui.
 * - `provider` percorre todos os `ProviderId` do catálogo mais um identificador
 *   sintético de provider futuro. As linhas de FC vêm apenas do dado
 *   normalizado, então a origem não pode alterar o resultado.
 *
 * Os demais campos opcionais (distância, calorias, pace, velocidade, cadência,
 * potência, elevação) também variam entre presentes e ausentes, para garantir
 * que a presença/ausência das linhas de FC não é efeito colateral de outra
 * métrica ter sido incluída ou descartada na montagem.
 *
 * `buildBaseActivityVisualData` é puro e sem I/O, então nenhum mock é
 * necessário: o alvo é exatamente a visão base (`buildBaseOverviewMetrics`).
 */

import type { Activity } from "@prisma/client";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatHeartRate } from "@/lib/format";
import { buildBaseActivityVisualData } from "@/modules/shared/activities/presentation/get-activity-visual-data";
import type { ActivityMetricRow } from "@/modules/shared/activities/presentation/activity-visual-data";
import { RYVANO_SPORT_TYPES } from "@/modules/shared/activities/sport-types";
import { PROVIDERS } from "@/modules/shared/integrations/catalog";

const NUM_RUNS = 200;

const AVERAGE_HR_LABEL = "FC média";
const MAX_HR_LABEL = "FC máxima";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * FC agregada: ausente (`null`) ou presente. `0` entra na faixa de propósito —
 * é um valor "presente" e não deve ser confundido com ausência de dado.
 */
const heartRateValue: fc.Arbitrary<number | null> = fc.option(
  fc.integer({ min: 0, max: 240 }),
  { nil: null },
);

const optionalMetric = (max: number): fc.Arbitrary<number | null> =>
  fc.option(fc.double({ min: 0, max, noNaN: true }), { nil: null });

/**
 * Modalidade: toda a taxonomia canônica, mais valores fora dela (desconhecido,
 * string vazia e `null`), que devem cair na categoria `"default"` sem alterar
 * as linhas de FC.
 */
const sportTypeValue: fc.Arbitrary<string | null> = fc.oneof(
  fc.constantFrom(...RYVANO_SPORT_TYPES),
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
  fc
    .string({ minLength: 1, maxLength: 8 })
    .map((suffix) => `FUTURE_${suffix}`),
);

interface GeneratedActivityFields {
  provider: string;
  sportType: string | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  averagePace: number | null;
  averageSpeed: number | null;
  maxSpeed: number | null;
  elevationGain: number | null;
  averageCadence: number | null;
  averagePower: number | null;
  maxPower: number | null;
}

const activityFields: fc.Arbitrary<GeneratedActivityFields> = fc.record({
  provider: providerValue,
  sportType: sportTypeValue,
  averageHeartRate: heartRateValue,
  maxHeartRate: heartRateValue,
  durationSeconds: optionalMetric(20_000),
  distanceMeters: optionalMetric(200_000),
  calories: optionalMetric(5_000),
  averagePace: optionalMetric(900),
  averageSpeed: optionalMetric(20),
  maxSpeed: optionalMetric(30),
  elevationGain: optionalMetric(3_000),
  averageCadence: optionalMetric(220),
  averagePower: optionalMetric(600),
  maxPower: optionalMetric(900),
});

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/**
 * Atividade no formato Prisma `Activity`, sem nenhum dado pessoal real. Só os
 * campos lidos pelo builder base importam; os demais ficam neutros.
 */
function makeActivity(fields: GeneratedActivityFields): Activity {
  return {
    id: "act_property_hr",
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

function rowsWithLabel(
  rows: readonly ActivityMetricRow[],
  label: string,
): ActivityMetricRow[] {
  return rows.filter((row) => row.label === label);
}

// ---------------------------------------------------------------------------
// Property 6
// ---------------------------------------------------------------------------

describe("buildBaseOverviewMetrics — FC agregada (Property 6)", () => {
  it("inclui 'FC média' se e somente se averageHeartRate estiver presente", () => {
    fc.assert(
      fc.property(activityFields, (fields) => {
        const activity = makeActivity(fields);

        const { overviewMetrics } = buildBaseActivityVisualData(activity);
        const matches = rowsWithLabel(overviewMetrics, AVERAGE_HR_LABEL);

        if (fields.averageHeartRate === null) {
          expect(matches).toHaveLength(0);
          return;
        }

        // Presente => exatamente uma linha, com o valor formatado do dado
        // normalizado (nada de placeholder "—" rotulado como se fosse real).
        expect(matches).toHaveLength(1);
        expect(matches[0]!.value).toBe(formatHeartRate(fields.averageHeartRate));
        expect(matches[0]!.value).not.toBe("—");
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("inclui 'FC máxima' se e somente se maxHeartRate estiver presente", () => {
    fc.assert(
      fc.property(activityFields, (fields) => {
        const activity = makeActivity(fields);

        const { overviewMetrics } = buildBaseActivityVisualData(activity);
        const matches = rowsWithLabel(overviewMetrics, MAX_HR_LABEL);

        if (fields.maxHeartRate === null) {
          expect(matches).toHaveLength(0);
          return;
        }

        expect(matches).toHaveLength(1);
        expect(matches[0]!.value).toBe(formatHeartRate(fields.maxHeartRate));
        expect(matches[0]!.value).not.toBe("—");
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("as duas linhas são independentes entre si: uma presente não arrasta a outra", () => {
    fc.assert(
      fc.property(activityFields, (fields) => {
        const activity = makeActivity(fields);

        const { overviewMetrics } = buildBaseActivityVisualData(activity);

        const hasAverageRow =
          rowsWithLabel(overviewMetrics, AVERAGE_HR_LABEL).length === 1;
        const hasMaxRow = rowsWithLabel(overviewMetrics, MAX_HR_LABEL).length === 1;

        expect(hasAverageRow).toBe(fields.averageHeartRate !== null);
        expect(hasMaxRow).toBe(fields.maxHeartRate !== null);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("não depende da modalidade: a mesma FC produz as mesmas linhas em qualquer sportType", () => {
    fc.assert(
      fc.property(
        activityFields,
        sportTypeValue,
        sportTypeValue,
        (fields, firstSportType, secondSportType) => {
          const first = buildBaseActivityVisualData(
            makeActivity({ ...fields, sportType: firstSportType }),
          );
          const second = buildBaseActivityVisualData(
            makeActivity({ ...fields, sportType: secondSportType }),
          );

          expect(rowsWithLabel(first.overviewMetrics, AVERAGE_HR_LABEL)).toEqual(
            rowsWithLabel(second.overviewMetrics, AVERAGE_HR_LABEL),
          );
          expect(rowsWithLabel(first.overviewMetrics, MAX_HR_LABEL)).toEqual(
            rowsWithLabel(second.overviewMetrics, MAX_HR_LABEL),
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("não depende do provider de origem: a mesma FC produz as mesmas linhas em qualquer provider", () => {
    fc.assert(
      fc.property(
        activityFields,
        providerValue,
        providerValue,
        (fields, firstProvider, secondProvider) => {
          const first = buildBaseActivityVisualData(
            makeActivity({ ...fields, provider: firstProvider }),
          );
          const second = buildBaseActivityVisualData(
            makeActivity({ ...fields, provider: secondProvider }),
          );

          expect(rowsWithLabel(first.overviewMetrics, AVERAGE_HR_LABEL)).toEqual(
            rowsWithLabel(second.overviewMetrics, AVERAGE_HR_LABEL),
          );
          expect(rowsWithLabel(first.overviewMetrics, MAX_HR_LABEL)).toEqual(
            rowsWithLabel(second.overviewMetrics, MAX_HR_LABEL),
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("nunca lança, para qualquer combinação de dados opcionais ausentes", () => {
    fc.assert(
      fc.property(activityFields, (fields) => {
        const activity = makeActivity(fields);

        expect(() => buildBaseActivityVisualData(activity)).not.toThrow();

        const { overviewMetrics } = buildBaseActivityVisualData(activity);

        // Omissão graciosa: nenhuma linha entra com placeholder de "sem dado"
        // (Requisito 3.3) e a visão base nunca fica sem nenhuma métrica.
        expect(overviewMetrics.every((row) => row.value !== "—")).toBe(true);
        expect(overviewMetrics.length).toBeGreaterThan(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
