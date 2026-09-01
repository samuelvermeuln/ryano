import { describe, expect, it } from "vitest";

import type { StravaStreamSetObjectDto } from "@/modules/strava/api/dto/strava-stream";
import { stravaStreamSetObjectSchema } from "@/modules/strava/api/schemas/strava-stream";
import {
  parseStravaStreams,
  toHeartRateSamples,
  type ParsedActivityStream,
} from "@/modules/strava/parsers/parse-strava-streams";

/** Constrói um DTO validado pelo schema real, garantindo que a forma é a da API. */
function streamSet(raw: unknown): StravaStreamSetObjectDto {
  return stravaStreamSetObjectSchema.parse(raw);
}

function numberStream(data: number[], seriesType?: "time" | "distance") {
  return {
    type: "generic",
    data,
    series_type: seriesType,
    original_size: data.length,
    resolution: "high",
  };
}

describe("parseStravaStreams", () => {
  it("retorna lista vazia quando nenhum stream vem na resposta", () => {
    expect(parseStravaStreams(streamSet({}))).toEqual([]);
  });

  it("converte uma entrada por chave numérica presente, preservando ordem dos valores", () => {
    const dto = streamSet({
      time: numberStream([0, 1, 2]),
      heartrate: numberStream([120, 130, 140]),
      distance: numberStream([0, 3.2, 6.4], "distance"),
    });

    const streams = parseStravaStreams(dto);

    expect(streams).toHaveLength(3);
    expect(streams.map((stream) => stream.type)).toEqual([
      "time",
      "distance",
      "heartrate",
    ]);
    expect(streams.find((stream) => stream.type === "heartrate")?.values).toEqual([
      120, 130, 140,
    ]);
    expect(streams.find((stream) => stream.type === "distance")?.seriesType).toBe(
      "distance",
    );
  });

  it("ignora streams não numéricos (latlng/moving) e assume eixo temporal sem series_type", () => {
    const dto = streamSet({
      heartrate: numberStream([100]),
      latlng: {
        type: "latlng",
        data: [[-23.5, -46.6]],
        series_type: "distance",
      },
      moving: { type: "moving", data: [true], series_type: "distance" },
    });

    const streams = parseStravaStreams(dto);

    expect(streams).toHaveLength(1);
    expect(streams[0]).toEqual({
      type: "heartrate",
      seriesType: "time",
      values: [100],
    });
  });

  it("não muta os dados do DTO de entrada", () => {
    const dto = streamSet({ heartrate: numberStream([100, 110]) });
    const streams = parseStravaStreams(dto);

    streams[0].values.push(999);

    expect(dto.heartrate?.data).toEqual([100, 110]);
  });
});

describe("toHeartRateSamples", () => {
  it("retorna null quando não há stream de FC", () => {
    const streams = parseStravaStreams(streamSet({ time: numberStream([0, 1]) }));

    expect(toHeartRateSamples(streams)).toBeNull();
  });

  it("retorna null quando o stream de FC não tem amostras utilizáveis", () => {
    expect(toHeartRateSamples(parseStravaStreams(streamSet({
      heartrate: numberStream([]),
    })))).toBeNull();
  });

  it("pareia FC com o stream time pelo mesmo índice", () => {
    const streams = parseStravaStreams(
      streamSet({
        time: numberStream([0, 5, 12]),
        heartrate: numberStream([120, 135, 150]),
      }),
    );

    expect(toHeartRateSamples(streams)).toEqual([
      { timeSeconds: 0, bpm: 120 },
      { timeSeconds: 5, bpm: 135 },
      { timeSeconds: 12, bpm: 150 },
    ]);
  });

  it("gera amostragem uniforme sintética quando o stream time está ausente", () => {
    const streams = parseStravaStreams(
      streamSet({ heartrate: numberStream([120, 130, 140]) }),
    );

    expect(toHeartRateSamples(streams)).toEqual([
      { timeSeconds: 0, bpm: 120 },
      { timeSeconds: 1, bpm: 130 },
      { timeSeconds: 2, bpm: 140 },
    ]);
  });

  it("cai para o índice quando o stream time é mais curto que o de FC", () => {
    const streams = parseStravaStreams(
      streamSet({
        time: numberStream([0, 5]),
        heartrate: numberStream([120, 135, 150]),
      }),
    );

    expect(toHeartRateSamples(streams)).toEqual([
      { timeSeconds: 0, bpm: 120 },
      { timeSeconds: 5, bpm: 135 },
      { timeSeconds: 2, bpm: 150 },
    ]);
  });

  // O schema Zod já rejeita valores não finitos, então a série vem montada à mão
  // aqui: a guarda em `toHeartRateSamples` é defensiva para streams internos de
  // outra origem.
  it("descarta amostras de FC não finitas", () => {
    const streams: ParsedActivityStream[] = [
      { type: "time", seriesType: "time", values: [0, 1, 2] },
      { type: "heartrate", seriesType: "time", values: [120, Number.NaN, 150] },
    ];

    expect(toHeartRateSamples(streams)).toEqual([
      { timeSeconds: 0, bpm: 120 },
      { timeSeconds: 2, bpm: 150 },
    ]);
  });
});
