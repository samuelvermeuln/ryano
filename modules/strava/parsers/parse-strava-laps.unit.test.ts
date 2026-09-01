import { describe, expect, it } from "vitest";

import type { StravaLapDto } from "@/modules/strava/api/dto/strava-lap";
import { stravaLapListSchema } from "@/modules/strava/api/schemas/strava-lap";
import { parseStravaLaps } from "@/modules/strava/parsers/parse-strava-laps";

/** Constrói DTOs validados pelo schema real, garantindo que a forma é a da API. */
function laps(raw: unknown[]): StravaLapDto[] {
  return stravaLapListSchema.parse(raw);
}

describe("parseStravaLaps", () => {
  it("retorna lista vazia quando a atividade não tem laps", () => {
    expect(parseStravaLaps(laps([]))).toEqual([]);
  });

  it("converte as métricas do lap preservando unidades da API", () => {
    const parsed = parseStravaLaps(
      laps([
        {
          id: 1,
          lap_index: 1,
          elapsed_time: 320,
          moving_time: 310,
          distance: 1000.5,
          average_speed: 3.2,
          average_cadence: 86.5,
          average_watts: 210,
          average_heartrate: 154.3,
        },
      ]),
    );

    expect(parsed).toEqual([
      {
        index: 1,
        durationSeconds: 320,
        distanceMeters: 1000.5,
        averageHeartRate: 154.3,
        averageCadence: 86.5,
        averageSpeed: 3.2,
        averageWatts: 210,
      },
    ]);
  });

  it("ordena por lap_index independentemente da ordem recebida", () => {
    const parsed = parseStravaLaps(
      laps([
        { id: 3, lap_index: 3 },
        { id: 1, lap_index: 1 },
        { id: 2, lap_index: 2 },
      ]),
    );

    expect(parsed.map((lap) => lap.index)).toEqual([1, 2, 3]);
  });

  it("usa split como fallback quando lap_index está ausente", () => {
    const parsed = parseStravaLaps(
      laps([
        { id: 2, split: 2 },
        { id: 1, split: 1 },
      ]),
    );

    expect(parsed.map((lap) => lap.index)).toEqual([1, 2]);
  });

  it("cai para a posição 1-based no array quando não há lap_index nem split", () => {
    const parsed = parseStravaLaps(laps([{ id: 10 }, { id: 20 }]));

    expect(parsed.map((lap) => lap.index)).toEqual([1, 2]);
  });

  it("converte métricas ausentes ou nulas em null, sem lançar", () => {
    const parsed = parseStravaLaps(
      laps([
        {
          id: 1,
          elapsed_time: null,
          distance: null,
          average_heartrate: null,
          average_cadence: null,
          average_speed: null,
          average_watts: null,
        },
      ]),
    );

    expect(parsed).toEqual([
      {
        index: 1,
        durationSeconds: null,
        distanceMeters: null,
        averageHeartRate: null,
        averageCadence: null,
        averageSpeed: null,
        averageWatts: null,
      },
    ]);
  });

  it("preserva average_watts estimado (device_watts false)", () => {
    const parsed = parseStravaLaps(
      laps([{ id: 1, average_watts: 180, device_watts: false }]),
    );

    expect(parsed[0].averageWatts).toBe(180);
  });

  it("mantém a ordem original entre laps com o mesmo índice e não muta a entrada", () => {
    const dtos = laps([
      { id: 7, lap_index: 1, distance: 100 },
      { id: 8, lap_index: 1, distance: 200 },
    ]);

    const parsed = parseStravaLaps(dtos);

    expect(parsed.map((lap) => lap.distanceMeters)).toEqual([100, 200]);
    expect(dtos.map((dto) => dto.id)).toEqual([7, 8]);
  });
});
