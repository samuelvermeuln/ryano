import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatDuration } from "@/lib/format";
import {
  HEART_RATE_ZONE_COUNT,
  HEART_RATE_ZONE_LABELS,
  HEART_RATE_ZONES_SECTION_ID,
  computeHeartRateZonesFromStream,
  type HeartRateSample,
} from "@/modules/shared/activities/heart-rate-zones/compute-heart-rate-zones-from-stream";

/**
 * Testes de propriedade do cálculo compartilhado de zonas de FC.
 *
 * Feature: detalhe-atividade-multi-provider, Property 4: cálculo de zonas por
 * stream produz exatamente 5 faixas cobrindo o tempo total, e omissão sem dado
 * suficiente.
 * Feature: detalhe-atividade-multi-provider, Property 15: cálculo de zonas de
 * FC é puro e determinístico.
 *
 * **Validates: Requirements 2.3, 2.6, 10.3**
 */

const NUM_RUNS = 200;

/** Instantes finitos (segundos), podendo ser negativos, repetidos e fora de ordem. */
const timeSecondsArbitrary = fc.integer({ min: -3_600, max: 86_400 });

/** FC da amostra: valores plausíveis + valores degenerados que não devem quebrar a conta. */
const bpmArbitrary = fc.oneof(
  { weight: 9, arbitrary: fc.integer({ min: 0, max: 260 }) },
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -30,
    ),
  },
);

const sampleArbitrary: fc.Arbitrary<HeartRateSample> = fc.record({
  timeSeconds: timeSecondsArbitrary,
  bpm: bpmArbitrary,
});

const nonEmptySamplesArbitrary = fc.array(sampleArbitrary, { minLength: 1, maxLength: 80 });

const anySamplesArbitrary = fc.array(sampleArbitrary, { maxLength: 80 });

/** FC máxima de referência válida (número positivo finito). */
const validMaxHeartRateArbitrary = fc.double({
  min: 1,
  max: 260,
  noNaN: true,
  noDefaultInfinity: true,
});

/** FC máxima de referência insuficiente para o cálculo (Requisito 2.6). */
const insufficientMaxHeartRateArbitrary = fc.oneof(
  fc.integer({ min: -300, max: 0 }),
  fc.constantFrom(
    0,
    -0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -0.000_1,
  ),
);

/** FC máxima de referência arbitrária (válida ou degenerada). */
const anyMaxHeartRateArbitrary = fc.oneof(
  validMaxHeartRateArbitrary,
  insufficientMaxHeartRateArbitrary,
);

/**
 * Intervalo total coberto pela série, na mesma convenção da implementação:
 * `último instante - primeiro instante` após ordenação por instante.
 */
function totalIntervalSeconds(samples: readonly HeartRateSample[]): number {
  const times = samples.map((sample) => sample.timeSeconds);

  return Math.max(...times) - Math.min(...times);
}

describe("computeHeartRateZonesFromStream (propriedades)", () => {
  it("Property 4: séries não-vazias com FC máx. positiva produzem 5 faixas cobrindo o intervalo total", () => {
    fc.assert(
      fc.property(
        nonEmptySamplesArbitrary,
        validMaxHeartRateArbitrary,
        (samples, maxHeartRateReference) => {
          const section = computeHeartRateZonesFromStream(samples, maxHeartRateReference);

          expect(section).not.toBeNull();
          expect(section?.id).toBe(HEART_RATE_ZONES_SECTION_ID);
          expect(section?.approximate).toBe(true);

          const items = section?.items ?? [];

          // Exatamente 5 faixas, sempre nos mesmos rótulos e na mesma ordem.
          expect(items).toHaveLength(HEART_RATE_ZONE_COUNT);
          expect(items.map((item) => item.label)).toEqual([...HEART_RATE_ZONE_LABELS]);

          for (const item of items) {
            expect(Number.isFinite(item.ratio)).toBe(true);
            expect(item.ratio).toBeGreaterThanOrEqual(0);
            expect(item.ratio).toBeLessThanOrEqual(1);
            expect(item.color).toBeTruthy();
          }

          const totalRatio = items.reduce((total, item) => total + item.ratio, 0);

          if (totalIntervalSeconds(samples) > 0) {
            // O tempo distribuído entre as faixas cobre todo o intervalo da série.
            expect(totalRatio).toBeCloseTo(1, 10);
          } else {
            // Série sem duração observável (uma amostra, ou todas no mesmo instante).
            expect(totalRatio).toBe(0);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("Property 4: série de FC constante concentra o intervalo total em uma única faixa", () => {
    fc.assert(
      fc.property(
        fc.array(timeSecondsArbitrary, { minLength: 2, maxLength: 80 }),
        fc.integer({ min: 1, max: 260 }),
        validMaxHeartRateArbitrary,
        (times, bpm, maxHeartRateReference) => {
          const samples = times.map((timeSeconds) => ({ timeSeconds, bpm }));
          const expectedSeconds = totalIntervalSeconds(samples);

          const section = computeHeartRateZonesFromStream(samples, maxHeartRateReference);
          const items = section?.items ?? [];

          expect(items).toHaveLength(HEART_RATE_ZONE_COUNT);

          if (expectedSeconds === 0) {
            expect(items.every((item) => item.ratio === 0)).toBe(true);

            return;
          }

          // Toda a FC cai na mesma faixa: uma faixa com 100% do tempo, as outras zeradas.
          const filled = items.filter((item) => item.ratio > 0);

          expect(filled).toHaveLength(1);
          expect(filled[0]?.ratio).toBe(1);
          // O tempo exibido nessa faixa é exatamente o intervalo total da série.
          expect(filled[0]?.valueText).toBe(`${formatDuration(expectedSeconds)} · 100%`);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("Property 4: série vazia ou FC máx. de referência insuficiente retorna null, sem lançar", () => {
    fc.assert(
      fc.property(
        anySamplesArbitrary,
        insufficientMaxHeartRateArbitrary,
        (samples, insufficientMaxHeartRate) => {
          // Sem dado suficiente de FC máx.: omissão graciosa (Requisito 2.6).
          expect(computeHeartRateZonesFromStream(samples, insufficientMaxHeartRate)).toBeNull();
        },
      ),
      { numRuns: NUM_RUNS },
    );

    fc.assert(
      fc.property(anyMaxHeartRateArbitrary, (maxHeartRateReference) => {
        // Série vazia: omissão graciosa para qualquer FC máx. de referência.
        expect(computeHeartRateZonesFromStream([], maxHeartRateReference)).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("Property 4: nunca lança para nenhuma combinação de série e FC máx. de referência", () => {
    fc.assert(
      fc.property(
        anySamplesArbitrary,
        anyMaxHeartRateArbitrary,
        (samples, maxHeartRateReference) => {
          expect(() => computeHeartRateZonesFromStream(samples, maxHeartRateReference)).not.toThrow();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("Property 15: duas chamadas com os mesmos argumentos produzem resultados estruturalmente idênticos", () => {
    fc.assert(
      fc.property(
        anySamplesArbitrary,
        anyMaxHeartRateArbitrary,
        (samples, maxHeartRateReference) => {
          const snapshot = samples.map((sample) => ({ ...sample }));

          const first = computeHeartRateZonesFromStream(samples, maxHeartRateReference);
          const second = computeHeartRateZonesFromStream(samples, maxHeartRateReference);

          // Determinismo estrutural (função pura, sem I/O nem estado interno).
          expect(second).toEqual(first);
          expect(JSON.stringify(second)).toBe(JSON.stringify(first));
          // Pureza: a série recebida não é mutada.
          expect(samples).toEqual(snapshot);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
