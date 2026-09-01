import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { StravaStreamSetObjectDto } from "@/modules/strava/api/dto/strava-stream";
import { stravaStreamSetObjectSchema } from "@/modules/strava/api/schemas/strava-stream";
import {
  PARSED_ACTIVITY_STREAM_TYPES,
  parseStravaStreams,
  type ParsedActivityStreamSeriesType,
  type ParsedActivityStreamType,
} from "@/modules/strava/parsers/parse-strava-streams";

const NUM_RUNS = 200;

/** Chaves de stream não numérico do `StreamSet` — fora de `ParsedActivityStream`. */
const NON_NUMERIC_STREAM_KEYS = ["latlng", "moving"] as const;

/** Chave desconhecida: o schema é `passthrough`, então a API pode crescer. */
const UNKNOWN_STREAM_KEY = "future_unknown_stream";

const VALID_SERIES_TYPES: readonly ParsedActivityStreamSeriesType[] = [
  "distance",
  "time",
];

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
 * Números finitos: `z.number()` rejeita `NaN` e `z.number().int()` rejeita
 * `Infinity`, então um DTO com valor não finito simplesmente não seria válido —
 * e esta propriedade fala apenas de DTOs válidos.
 */
const finiteNumber: fc.Arbitrary<number> = fc.oneof(
  { arbitrary: fc.integer({ min: -100_000, max: 100_000 }), weight: 2 },
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

/** Metadados comuns a qualquer stream, com opcionais podendo faltar. */
const streamMetaRaw: fc.Arbitrary<Record<string, unknown>> = fc
  .record({
    type: fc.option(
      fc.oneof(
        fc.constantFrom("time", "heartrate", "latlng", "moving", "generic"),
        fc.string({ maxLength: 12 }),
      ),
      { nil: undefined },
    ),
    // `series_type` misturado de propósito: válido, nulo ou ausente.
    series_type: fc.constantFrom<"distance" | "time" | null | undefined>(
      "distance",
      "time",
      null,
      undefined,
    ),
    original_size: fc.option(fc.integer({ min: 0, max: 100_000 }), {
      nil: undefined,
    }),
    resolution: fc.constantFrom<"low" | "medium" | "high" | null | undefined>(
      "low",
      "medium",
      "high",
      null,
      undefined,
    ),
  })
  .map(withoutUndefined);

/** `data` de um stream numérico, com peso extra para o caso de série vazia. */
const numberSeries: fc.Arbitrary<number[]> = fc.oneof(
  { arbitrary: fc.constant<number[]>([]), weight: 1 },
  {
    arbitrary: fc.array(finiteNumber, { minLength: 1, maxLength: 12 }),
    weight: 4,
  },
);

const numberStreamRaw: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(streamMetaRaw, numberSeries)
  .map(([meta, data]) => ({ ...meta, data }));

/** `latlng`: lista de pares `[lat, lng]` (o schema aceita arrays numéricos). */
const latLngStreamRaw: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(
    streamMetaRaw,
    fc.array(
      fc
        .tuple(
          fc.double({ min: -90, max: 90, noNaN: true }),
          fc.double({ min: -180, max: 180, noNaN: true }),
        )
        .map(([lat, lng]) => [lat, lng]),
      { maxLength: 8 },
    ),
  )
  .map(([meta, data]) => ({ ...meta, data }));

/** `moving`: série booleana. */
const booleanStreamRaw: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(streamMetaRaw, fc.array(fc.boolean(), { maxLength: 12 }))
  .map(([meta, data]) => ({ ...meta, data }));

/**
 * `StreamSet` bruto arbitrário: nenhuma chave é obrigatória (`requiredKeys: []`),
 * cobrindo do objeto vazio até o conjunto completo, com streams não numéricos e
 * uma chave desconhecida que o `passthrough` do schema preserva.
 */
const streamSetRaw: fc.Arbitrary<Record<string, unknown>> = fc.record(
  {
    time: numberStreamRaw,
    distance: numberStreamRaw,
    heartrate: numberStreamRaw,
    cadence: numberStreamRaw,
    watts: numberStreamRaw,
    velocity_smooth: numberStreamRaw,
    altitude: numberStreamRaw,
    grade_smooth: numberStreamRaw,
    temp: numberStreamRaw,
    latlng: latLngStreamRaw,
    moving: booleanStreamRaw,
    [UNKNOWN_STREAM_KEY]: fc.oneof(
      numberStreamRaw,
      fc.constant<Record<string, unknown>>({ data: [] }),
    ),
  },
  { requiredKeys: [] },
);

/**
 * Valida o objeto bruto com o schema Zod real: só DTOs genuinamente válidos
 * entram na propriedade. A validação em si é asserida (nenhum caso gerado deve
 * ser inválido — isso significaria gerador desalinhado do schema).
 */
function toValidDto(raw: Record<string, unknown>): StravaStreamSetObjectDto {
  const validation = stravaStreamSetObjectSchema.safeParse(raw);

  expect(validation.success).toBe(true);

  if (!validation.success) {
    throw validation.error;
  }

  return validation.data;
}

/** Chaves numéricas presentes no DTO, na ordem canônica do parser. */
function presentNumericTypes(
  dto: StravaStreamSetObjectDto,
): ParsedActivityStreamType[] {
  return PARSED_ACTIVITY_STREAM_TYPES.filter(
    (type) => dto[type] !== undefined && dto[type] !== null,
  );
}

/**
 * Feature: detalhe-atividade-multi-provider, Property 14: Parsers de stream/lap
 * produzem estrutura interna bem formada para qualquer DTO válido — para
 * qualquer `StravaStreamSetObjectDto` que passe na validação Zod (incluindo
 * casos com chaves opcionais ausentes), `parseStravaStreams` produz uma lista de
 * `ParsedActivityStream` sem lançar exceção, preservando os tipos e os índices
 * presentes no DTO de entrada.
 *
 * **Validates: Requirements 9.3**
 */
describe("parseStravaStreams com DTO válido arbitrário (Property 14)", () => {
  it("nunca lança e devolve sempre uma lista bem formada", () => {
    fc.assert(
      fc.property(streamSetRaw, (raw) => {
        const streams = parseStravaStreams(toValidDto(raw));

        expect(Array.isArray(streams)).toBe(true);
        expect(streams.length).toBeLessThanOrEqual(
          PARSED_ACTIVITY_STREAM_TYPES.length,
        );

        for (const stream of streams) {
          expect(PARSED_ACTIVITY_STREAM_TYPES).toContain(stream.type);
          expect(VALID_SERIES_TYPES).toContain(stream.seriesType);
          expect(Array.isArray(stream.values)).toBe(true);

          for (const value of stream.values) {
            expect(typeof value).toBe("number");
            expect(Number.isFinite(value)).toBe(true);
          }
        }

        // Um stream por tipo, sem duplicatas.
        expect(new Set(streams.map((stream) => stream.type)).size).toBe(
          streams.length,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("preserva exatamente os tipos numéricos presentes, na ordem canônica, ignorando os não numéricos", () => {
    fc.assert(
      fc.property(streamSetRaw, (raw) => {
        const dto = toValidDto(raw);
        const types = parseStravaStreams(dto).map((stream) => stream.type);

        expect(types).toEqual(presentNumericTypes(dto));

        for (const key of [...NON_NUMERIC_STREAM_KEYS, UNKNOWN_STREAM_KEY]) {
          expect(types).not.toContain(key);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("preserva comprimento e índices de cada série, em cópias independentes do DTO", () => {
    fc.assert(
      fc.property(streamSetRaw, (raw) => {
        const dto = toValidDto(raw);
        const streams = parseStravaStreams(dto);

        for (const stream of streams) {
          const source = dto[stream.type];

          expect(source).toBeDefined();
          expect(stream.values).toHaveLength(source?.data.length ?? -1);
          expect(stream.values).not.toBe(source?.data);

          stream.values.forEach((value, index) => {
            expect(Object.is(value, source?.data[index])).toBe(true);
          });
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("preserva o series_type do DTO e assume o eixo temporal quando ausente ou nulo", () => {
    fc.assert(
      fc.property(streamSetRaw, (raw) => {
        const dto = toValidDto(raw);

        for (const stream of parseStravaStreams(dto)) {
          const rawSeriesType = dto[stream.type]?.series_type;

          expect(stream.seriesType).toBe(
            rawSeriesType === "distance" || rawSeriesType === "time"
              ? rawSeriesType
              : "time",
          );
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
