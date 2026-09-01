import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  getMetricDisplayCategory,
  METRIC_DISPLAY_RULES,
  type MetricDisplayCategory,
} from "@/modules/shared/activities/metric-display-categories";
import {
  RYVANO_SPORT_TYPES,
  type RyvanoSportType,
} from "@/modules/shared/activities/sport-types";

const NUM_RUNS = 300;

/** Toda modalidade canônica (existentes + as novas da Tarefa 1.1). */
const sportType: fc.Arbitrary<RyvanoSportType> = fc.constantFrom(
  ...RYVANO_SPORT_TYPES,
);

/**
 * Providers simulados apenas no contexto do teste: identificadores do catálogo
 * atual, futuros e arbitrários. `getMetricDisplayCategory` não recebe provider
 * algum — estes valores existem só para montar atividades sintéticas que
 * diferem exclusivamente na origem.
 */
const simulatedProviderId: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: fc.constantFrom("GARMIN", "STRAVA", "POLAR", "COROS"), weight: 3 },
  { arbitrary: fc.string({ minLength: 1, maxLength: 12 }), weight: 1 },
);

/** Atividade sintética mínima: só o que distingue origem de modalidade. */
interface SyntheticActivity {
  providerId: string;
  sportType: RyvanoSportType;
}

const syntheticActivity: fc.Arbitrary<SyntheticActivity> = fc.record({
  providerId: simulatedProviderId,
  sportType,
});

const KNOWN_CATEGORIES = new Set<string>(Object.keys(METRIC_DISPLAY_RULES));

function isKnownCategory(value: MetricDisplayCategory): boolean {
  return KNOWN_CATEGORIES.has(value);
}

/**
 * Feature: detalhe-atividade-multi-provider, Property 17: Categoria de
 * exibição de métricas é uma função pura do tipo de esporte canônico — para
 * qualquer `RyvanoSportType`, `getMetricDisplayCategory` retorna sempre a mesma
 * `MetricDisplayCategory`, sem lançar e independentemente do provider de
 * origem da atividade que carrega esse `sportType`.
 *
 * **Validates: Requirements 12.1**
 */
describe("getMetricDisplayCategory (Property 17)", () => {
  it("nunca lança e sempre retorna uma categoria conhecida", () => {
    fc.assert(
      fc.property(sportType, (sport) => {
        const category = getMetricDisplayCategory(sport);

        expect(typeof category).toBe("string");
        expect(isKnownCategory(category)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("é determinística: mesma entrada produz a mesma saída em chamadas repetidas", () => {
    fc.assert(
      fc.property(sportType, fc.integer({ min: 2, max: 10 }), (sport, calls) => {
        const first = getMetricDisplayCategory(sport);

        for (let index = 1; index < calls; index += 1) {
          expect(getMetricDisplayCategory(sport)).toBe(first);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("não guarda estado entre chamadas: intercalar outras modalidades não altera o resultado", () => {
    fc.assert(
      fc.property(sportType, fc.array(sportType, { maxLength: 20 }), (sport, others) => {
        const before = getMetricDisplayCategory(sport);

        for (const other of others) {
          getMetricDisplayCategory(other);
        }

        expect(getMetricDisplayCategory(sport)).toBe(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("depende só da modalidade canônica: atividades de providers diferentes com o mesmo sportType recebem a mesma categoria", () => {
    fc.assert(
      fc.property(syntheticActivity, simulatedProviderId, (activity, otherProviderId) => {
        const fromOtherProvider: SyntheticActivity = {
          ...activity,
          providerId: otherProviderId,
        };

        expect(getMetricDisplayCategory(fromOtherProvider.sportType)).toBe(
          getMetricDisplayCategory(activity.sportType),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("em um lote misto de atividades, a categoria é função apenas do sportType", () => {
    fc.assert(
      fc.property(
        fc.array(syntheticActivity, { minLength: 1, maxLength: 40 }),
        (activities) => {
          const categoryBySportType = new Map<RyvanoSportType, MetricDisplayCategory>();

          for (const activity of activities) {
            const category = getMetricDisplayCategory(activity.sportType);
            const seen = categoryBySportType.get(activity.sportType);

            if (seen === undefined) {
              categoryBySportType.set(activity.sportType, category);
            } else {
              // Nenhuma atividade do lote muda a categoria de um sportType já
              // visto, por mais que venha de outro provider.
              expect(category).toBe(seen);
            }
          }

          // O lote nunca produz categoria fora das conhecidas.
          for (const category of categoryBySportType.values()) {
            expect(isKnownCategory(category)).toBe(true);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
