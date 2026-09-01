import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  resolveMaxHeartRateReference,
  type MaxHeartRateReferenceInput,
} from "@/modules/shared/activities/heart-rate-zones/resolve-max-heart-rate-reference";

const NUM_RUNS = 300;

/** Fórmula genérica do Requisito 2.4-b, reescrita aqui como oráculo do teste. */
function ageEstimate(ageYears: number): number {
  return 208 - 0.7 * ageYears;
}

function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Fonte (a) do Requisito 2.4: FC máxima da atividade acima da FC média. */
function hasActivityMaxSource(input: MaxHeartRateReferenceInput): boolean {
  const { maxHeartRate, averageHeartRate } = input;

  if (!isUsableNumber(maxHeartRate)) {
    return false;
  }

  // FC média ausente/inválida não invalida a FC máxima observada.
  return !isUsableNumber(averageHeartRate) || maxHeartRate > averageHeartRate;
}

const absentValue = fc.constantFrom<number | null | undefined>(null, undefined);

const nonFiniteNumber = fc.constantFrom(
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
);

/** Faixa plausível de batimentos por minuto reportada por providers. */
const heartRateBpm = fc.integer({ min: 20, max: 240 });

/** Números finitos fora da faixa plausível (incluindo zero e negativos). */
const oddFiniteNumber = fc.double({
  min: -500,
  max: 500,
  noNaN: true,
  noDefaultInfinity: true,
});

const heartRateField = fc.oneof(
  { arbitrary: heartRateBpm, weight: 5 },
  { arbitrary: absentValue, weight: 3 },
  { arbitrary: oddFiniteNumber, weight: 2 },
  { arbitrary: nonFiniteNumber, weight: 1 },
);

const ageYearsField = fc.oneof(
  { arbitrary: fc.integer({ min: 0, max: 110 }), weight: 5 },
  { arbitrary: absentValue, weight: 3 },
  { arbitrary: oddFiniteNumber, weight: 2 },
  { arbitrary: nonFiniteNumber, weight: 1 },
);

/** Campos independentes: cobre presença/ausência de cada fonte livremente. */
const independentInput: fc.Arbitrary<MaxHeartRateReferenceInput> = fc.record({
  maxHeartRate: heartRateField,
  averageHeartRate: heartRateField,
  ageYears: ageYearsField,
});

/**
 * Par correlacionado com `maxHeartRate <= averageHeartRate` (dado incoerente
 * do provider): garante cobertura densa do caso em que a fonte (a) é
 * descartada mesmo havendo `maxHeartRate` presente.
 */
const incoherentPairInput: fc.Arbitrary<MaxHeartRateReferenceInput> = fc
  .tuple(heartRateBpm, fc.integer({ min: 0, max: 80 }), ageYearsField)
  .map(([averageHeartRate, delta, ageYears]) => ({
    maxHeartRate: averageHeartRate - delta,
    averageHeartRate,
    ageYears,
  }));

/**
 * Par correlacionado com `maxHeartRate > averageHeartRate`: garante cobertura
 * densa do caso em que a fonte (a) vence, inclusive com idade presente.
 */
const coherentPairInput: fc.Arbitrary<MaxHeartRateReferenceInput> = fc
  .tuple(heartRateBpm, fc.integer({ min: 1, max: 80 }), ageYearsField)
  .map(([averageHeartRate, delta, ageYears]) => ({
    maxHeartRate: averageHeartRate + delta,
    averageHeartRate,
    ageYears,
  }));

const anyInput: fc.Arbitrary<MaxHeartRateReferenceInput> = fc.oneof(
  { arbitrary: independentInput, weight: 3 },
  { arbitrary: incoherentPairInput, weight: 2 },
  { arbitrary: coherentPairInput, weight: 2 },
);

/**
 * Feature: detalhe-atividade-multi-provider, Property 5: Ordem de precedência
 * da FC máxima de referência é respeitada — para qualquer combinação de
 * `maxHeartRate`, `averageHeartRate` e `ageYears` (presentes ou ausentes),
 * `resolveMaxHeartRateReference` retorna o `maxHeartRate` da atividade quando
 * maior que `averageHeartRate`; senão a estimativa por idade quando `ageYears`
 * estiver presente; senão `null` — nesta ordem exata, sem exceção.
 *
 * **Validates: Requirements 2.4**
 */
describe("resolveMaxHeartRateReference (Property 5)", () => {
  it("nunca lança e sempre retorna null ou uma das fontes previstas", () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        const result = resolveMaxHeartRateReference(input);

        expect(result === null || typeof result === "number").toBe(true);

        if (result !== null) {
          const isActivityMax = result === input.maxHeartRate;
          const isAgeEstimate =
            isUsableNumber(input.ageYears) && result === ageEstimate(input.ageYears);

          expect(isActivityMax || isAgeEstimate).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("prefere (a) a FC máxima da atividade quando ela é utilizável, mesmo com idade presente", () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        fc.pre(hasActivityMaxSource(input));

        expect(resolveMaxHeartRateReference(input)).toBe(input.maxHeartRate);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("usa (b) a estimativa por idade somente quando a fonte (a) não está disponível", () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        fc.pre(!hasActivityMaxSource(input) && isUsableNumber(input.ageYears));

        expect(resolveMaxHeartRateReference(input)).toBe(ageEstimate(input.ageYears as number));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("retorna (c) null quando nenhuma das duas fontes está disponível", () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        fc.pre(!hasActivityMaxSource(input) && !isUsableNumber(input.ageYears));

        expect(resolveMaxHeartRateReference(input)).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("é indiferente à idade enquanto a fonte (a) estiver disponível", () => {
    fc.assert(
      fc.property(anyInput, ageYearsField, (input, otherAgeYears) => {
        fc.pre(hasActivityMaxSource(input));

        expect(resolveMaxHeartRateReference({ ...input, ageYears: otherAgeYears })).toBe(
          resolveMaxHeartRateReference(input),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("passa a usar a idade assim que a fonte (a) deixa de ser utilizável", () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        fc.pre(isUsableNumber(input.ageYears));

        const withoutActivityMax = { ...input, maxHeartRate: null };

        expect(resolveMaxHeartRateReference(withoutActivityMax)).toBe(
          ageEstimate(input.ageYears as number),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
