import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { StravaLapDto } from "@/modules/strava/api/dto/strava-lap";
import { stravaLapListSchema } from "@/modules/strava/api/schemas/strava-lap";
import {
  parseStravaLaps,
  type ParsedActivityLap,
} from "@/modules/strava/parsers/parse-strava-laps";

const NUM_RUNS = 200;

/** Campos que compõem um `ParsedActivityLap` — nada além disso deve sair. */
const PARSED_LAP_KEYS = [
  "index",
  "durationSeconds",
  "distanceMeters",
  "averageHeartRate",
  "averageCadence",
  "averageSpeed",
  "averageWatts",
] as const satisfies readonly (keyof ParsedActivityLap)[];

/** Métricas do lap que devem sair como `number | null`. */
const PARSED_LAP_METRIC_KEYS = PARSED_LAP_KEYS.filter(
  (key) => key !== "index",
);

/** Chave desconhecida: `stravaLapSchema` é `passthrough`, a API pode crescer. */
const UNKNOWN_LAP_KEY = "future_unknown_lap_field";

/**
 * Remove as chaves com valor `undefined` para que os campos opcionais fiquem
 * genuinamente **ausentes** do objeto (e não presentes com `undefined`).
 */
function withoutUndefined(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined),
  );
}

/**
 * Números finitos: no Zod vigente `z.number()` rejeita `NaN` **e** valores
 * infinitos, então um DTO com valor não finito simplesmente não seria válido —
 * e esta propriedade fala apenas de DTOs válidos.
 */
const finiteNumber: fc.Arbitrary<number> = fc.oneof(
  { arbitrary: fc.integer({ min: -10_000, max: 100_000 }), weight: 2 },
  {
    arbitrary: fc.double({
      min: -1_000_000,
      max: 1_000_000,
      noNaN: true,
      noDefaultInfinity: true,
    }),
    weight: 1,
  },
);

/** Métrica `z.number().nullish()`: presente, nula ou ausente. */
const nullishNumber: fc.Arbitrary<number | null | undefined> = fc.oneof(
  { arbitrary: finiteNumber, weight: 3 },
  { arbitrary: fc.constant(null), weight: 1 },
  { arbitrary: fc.constant(undefined), weight: 1 },
);

/** Métrica inteira `z.number().int().nullish()` (durações, índices). */
function nullishInt(
  min: number,
  max: number,
): fc.Arbitrary<number | null | undefined> {
  return fc.oneof(
    { arbitrary: fc.integer({ min, max }), weight: 3 },
    { arbitrary: fc.constant(null), weight: 1 },
    { arbitrary: fc.constant(undefined), weight: 1 },
  );
}

/**
 * Lap bruto arbitrário: só `id` é obrigatório no schema. `lap_index` e `split`
 * usam faixas pequenas e sobrepostas de propósito, para gerar empates de índice
 * (exercitando o desempate por posição) e laps sem nenhum dos dois.
 */
const lapRaw: fc.Arbitrary<Record<string, unknown>> = fc
  .record({
    id: fc.integer({ min: 1, max: 1_000_000 }),
    resource_state: fc.option(fc.integer({ min: 1, max: 3 }), {
      nil: undefined,
    }),
    name: fc.option(fc.string({ maxLength: 12 }), { nil: undefined }),
    elapsed_time: nullishInt(0, 7_200),
    moving_time: nullishInt(0, 7_200),
    start_date: fc.option(fc.constant("2024-05-01T10:00:00Z"), {
      nil: undefined,
    }),
    distance: nullishNumber,
    start_index: nullishInt(0, 5_000),
    end_index: nullishInt(0, 5_000),
    total_elevation_gain: nullishNumber,
    average_speed: nullishNumber,
    max_speed: nullishNumber,
    average_cadence: nullishNumber,
    device_watts: fc.constantFrom<boolean | null | undefined>(
      true,
      false,
      null,
      undefined,
    ),
    average_watts: nullishNumber,
    average_heartrate: nullishNumber,
    max_heartrate: nullishNumber,
    lap_index: nullishInt(-2, 5),
    split: nullishInt(-2, 5),
    pace_zone: nullishInt(0, 5),
    [UNKNOWN_LAP_KEY]: fc.option(fc.string({ maxLength: 8 }), {
      nil: undefined,
    }),
  })
  .map(withoutUndefined);

/** Lista de laps, incluindo a atividade sem laps nenhum. */
const lapListRaw: fc.Arbitrary<Record<string, unknown>[]> = fc.array(lapRaw, {
  maxLength: 8,
});

/**
 * Valida a lista bruta com o schema Zod real: só DTOs genuinamente válidos
 * entram na propriedade. A validação em si é asserida (nenhum caso gerado deve
 * ser inválido — isso significaria gerador desalinhado do schema).
 */
function toValidDtos(raw: Record<string, unknown>[]): StravaLapDto[] {
  const validation = stravaLapListSchema.safeParse(raw);

  expect(validation.success).toBe(true);

  if (!validation.success) {
    throw validation.error;
  }

  return validation.data;
}

/** Métrica presente e finita é preservada; ausente/nula vira `null`. */
function expectedMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Índice esperado: `lap_index` → `split` → posição 1-based no array. */
function expectedIndex(dto: StravaLapDto, position: number): number {
  return (
    expectedMetric(dto.lap_index) ??
    expectedMetric(dto.split) ??
    position + 1
  );
}

function toExpectedLap(dto: StravaLapDto, position: number): ParsedActivityLap {
  return {
    index: expectedIndex(dto, position),
    durationSeconds: expectedMetric(dto.elapsed_time),
    distanceMeters: expectedMetric(dto.distance),
    averageHeartRate: expectedMetric(dto.average_heartrate),
    averageCadence: expectedMetric(dto.average_cadence),
    averageSpeed: expectedMetric(dto.average_speed),
    averageWatts: expectedMetric(dto.average_watts),
  };
}

/**
 * Oráculo de ordenação independente do `sort` do parser: agrupa por índice
 * resolvido, ordena os índices distintos e concatena cada grupo na ordem
 * original — estável por construção.
 */
function stableSortByIndex(
  laps: readonly ParsedActivityLap[],
): ParsedActivityLap[] {
  const distinctIndexes = [...new Set(laps.map((lap) => lap.index))].sort(
    (a, b) => a - b,
  );

  return distinctIndexes.flatMap((index) =>
    laps.filter((lap) => lap.index === index),
  );
}

/** Assinatura campo a campo, para comparar multiconjuntos de laps. */
function fingerprints(laps: readonly ParsedActivityLap[]): string[] {
  return laps
    .map((lap) => PARSED_LAP_KEYS.map((key) => String(lap[key])).join("|"))
    .sort();
}

/**
 * Feature: detalhe-atividade-multi-provider, Property 14: Parsers de stream/lap
 * produzem estrutura interna bem formada para qualquer DTO válido — para
 * qualquer `StravaLapDto[]` que passe na validação Zod (incluindo casos com
 * campos opcionais ausentes), `parseStravaLaps` produz uma lista de
 * `ParsedActivityLap` sem lançar exceção, preservando os campos presentes no DTO
 * de entrada.
 *
 * **Validates: Requirements 9.3**
 */
describe("parseStravaLaps com DTO válido arbitrário (Property 14)", () => {
  it("nunca lança e devolve sempre uma lista bem formada, sem filtrar laps", () => {
    fc.assert(
      fc.property(lapListRaw, (raw) => {
        const dtos = toValidDtos(raw);
        const laps = parseStravaLaps(dtos);

        expect(Array.isArray(laps)).toBe(true);
        expect(laps).toHaveLength(dtos.length);

        for (const lap of laps) {
          expect(Object.keys(lap).sort()).toEqual([...PARSED_LAP_KEYS].sort());
          expect(typeof lap.index).toBe("number");
          expect(Number.isFinite(lap.index)).toBe(true);

          for (const key of PARSED_LAP_METRIC_KEYS) {
            const value = lap[key];

            if (value !== null) {
              expect(typeof value).toBe("number");
              expect(Number.isFinite(value)).toBe(true);
            }
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("preserva os campos presentes e mapeia ausentes ou nulos para null", () => {
    fc.assert(
      fc.property(lapListRaw, (raw) => {
        const dtos = toValidDtos(raw);
        const laps = parseStravaLaps(dtos);

        expect(fingerprints(laps)).toEqual(
          fingerprints(dtos.map(toExpectedLap)),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("ordena pelo índice resolvido mantendo a ordem original no empate", () => {
    fc.assert(
      fc.property(lapListRaw, (raw) => {
        const dtos = toValidDtos(raw);
        const laps = parseStravaLaps(dtos);

        expect(laps).toEqual(stableSortByIndex(dtos.map(toExpectedLap)));

        for (let position = 1; position < laps.length; position += 1) {
          expect(laps[position].index).toBeGreaterThanOrEqual(
            laps[position - 1].index,
          );
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("é pura: não muta a lista recebida nem os DTOs", () => {
    fc.assert(
      fc.property(lapListRaw, (raw) => {
        const dtos = toValidDtos(raw);
        const snapshot = structuredClone(dtos);

        parseStravaLaps(dtos);

        expect(dtos).toEqual(snapshot);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
