/**
 * SAM-39 — propriedades do mapeamento Strava → DTO canônico: nenhuma amostra
 * é inventada nem perdida, lacunas viram `null`, voltas mantêm a ordem e a
 * numeração, e uma stat ausente nunca vira 0.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { StravaStreamSetObjectDto } from "@/modules/strava/api/dto/strava-stream";
import type { ParsedActivityLap } from "@/modules/strava/parsers/parse-strava-laps";
import {
  lapsFromParsed,
  statsFromPayload,
  streamsFromDto,
} from "@/modules/strava/application/activities/strava-activity-detail-provider";

const finite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 });
const nullableFinite = fc.option(finite, { nil: null });

const streamArb = (type: string) => fc.array(finite, { minLength: 1, maxLength: 40 }).map((data) => ({
  type, data, series_type: "time", original_size: data.length, resolution: "high",
}));

const streamSetArb: fc.Arbitrary<StravaStreamSetObjectDto> = fc.record({
  time: fc.option(streamArb("time"), { nil: undefined }),
  heartrate: fc.option(streamArb("heartrate"), { nil: undefined }),
  watts: fc.option(streamArb("watts"), { nil: undefined }),
  temp: fc.option(streamArb("temp"), { nil: undefined }),
  latlng: fc.option(
    fc.array(fc.tuple(fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true })), { minLength: 1, maxLength: 40 })
      .map((data) => ({ type: "latlng", data, series_type: "time", original_size: data.length, resolution: "high" })),
    { nil: undefined },
  ),
}, { requiredKeys: [] }) as fc.Arbitrary<StravaStreamSetObjectDto>;

const lapArb: fc.Arbitrary<ParsedActivityLap> = fc.record({
  index: fc.integer({ min: 1, max: 500 }),
  durationSeconds: nullableFinite,
  distanceMeters: nullableFinite,
  averageHeartRate: nullableFinite,
  averageCadence: nullableFinite,
  averageSpeed: nullableFinite,
  averageWatts: nullableFinite,
});

describe("streamsFromDto", () => {
  it("cada série presente vira exatamente uma série canônica com o mesmo número de amostras", () => {
    fc.assert(fc.property(streamSetArb, (dto) => {
      const streams = streamsFromDto(dto);
      const present = (["time", "heartrate", "watts", "temp", "latlng"] as const).filter((key) => dto[key] !== undefined);
      expect(streams).toHaveLength(present.length);
      for (const stream of streams) {
        expect(new Set(streams.map((s) => s.key)).size).toBe(streams.length);
        expect(stream.source).toEqual({ provider: "STRAVA", kind: "native" });
      }
      const hr = streams.find((s) => s.key === "heartRate");
      if (dto.heartrate) expect(hr!.values).toEqual(dto.heartrate.data);
      const ll = streams.find((s) => s.key === "latlng");
      if (dto.latlng) expect(ll!.values).toHaveLength(dto.latlng.data.length);
    }));
  });
});

describe("lapsFromParsed", () => {
  it("preserva ordem, quantidade e numeração; o que o Strava não manda fica null", () => {
    fc.assert(fc.property(fc.array(lapArb, { maxLength: 30 }), (parsed) => {
      const laps = lapsFromParsed(parsed);
      expect(laps).toHaveLength(parsed.length);
      laps.forEach((lap, position) => {
        expect(lap.lapNumber).toBe(parsed[position]!.index);
        expect(lap.durationSeconds).toBe(parsed[position]!.durationSeconds);
        expect(lap.averagePower).toBe(parsed[position]!.averageWatts);
        expect(lap.maxHeartRate).toBeNull();
        expect(lap.calories).toBeNull();
      });
    }));
  });
});

describe("statsFromPayload", () => {
  it("ausência ≠ zero: só os campos presentes no payload aparecem, nunca 0 no lugar de null", () => {
    fc.assert(fc.property(
      fc.record({
        moving_time: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: undefined }),
        elapsed_time: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: undefined }),
        average_temp: fc.option(fc.double({ min: -40, max: 60, noNaN: true }), { nil: undefined }),
        map: fc.option(fc.record({ summary_polyline: fc.option(fc.string({ minLength: 1 }), { nil: undefined }) }), { nil: undefined }),
      }, { requiredKeys: [] }),
      (raw) => {
        const stats = statsFromPayload(raw);
        expect(stats.timerSeconds).toBe(raw.moving_time ?? null);
        expect(stats.elapsedSeconds).toBe(raw.elapsed_time ?? null);
        expect(stats.averageTemperature).toBe(raw.average_temp ?? null);
        expect(stats.routePolyline).toBe(raw.map?.summary_polyline ?? null);
        expect(stats.averageSwolf).toBeNull();
        expect(stats.caloriesActive).toBeNull();
      },
    ));
  });
});
