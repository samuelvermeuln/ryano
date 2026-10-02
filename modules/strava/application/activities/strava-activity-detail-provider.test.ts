/**
 * SAM-39 — Strava → NormalizedActivityDetail: laps reaproveitadas do cache,
 * streams (incl. latlng/temp) e stats do payload armazenado; nada inventado.
 */
import { describe, expect, it, vi } from "vitest";
import { stravaLapListSchema } from "@/modules/strava/api/schemas/strava-lap";
import { stravaStreamSetObjectSchema } from "@/modules/strava/api/schemas/strava-stream";
import { parseStravaLaps } from "@/modules/strava/parsers/parse-strava-laps";
import {
  STRAVA_INGEST_STREAM_KEYS,
  buildStravaActivityDetail,
  fetchStravaActivityDetail,
  statsFromPayload,
} from "@/modules/strava/application/activities/strava-activity-detail-provider";

const STREAMS = stravaStreamSetObjectSchema.parse({
  time: { type: "time", data: [0, 10, 20], series_type: "time", original_size: 3, resolution: "high" },
  heartrate: { type: "heartrate", data: [120, 140, 160], series_type: "time", original_size: 3, resolution: "high" },
  latlng: { type: "latlng", data: [[-23.5, -46.6], [-23.51, -46.61], [-23.52, -46.62]], series_type: "time", original_size: 3, resolution: "high" },
  temp: { type: "temp", data: [22, 22, 23], series_type: "time", original_size: 3, resolution: "high" },
});
const LAP_DTOS = stravaLapListSchema.parse([{ id: 1, lap_index: 1, elapsed_time: 600, distance: 2000, average_speed: 3.3, average_heartrate: 140.4 }]);
const LAPS = parseStravaLaps(LAP_DTOS);
const RAW = {
  sport_type: "TrailRun", moving_time: 1800, elapsed_time: 1900, average_temp: 22.5,
  map: { id: "m", summary_polyline: "abc" }, start_latlng: [-23.5, -46.6], end_latlng: [-23.52, -46.62],
};

describe("buildStravaActivityDetail", () => {
  it("compõe laps, streams canônicos (incl. latlng e temperatura) e stats do payload, com proveniência nativa", () => {
    const detail = buildStravaActivityDetail({ activity: { externalId: "9", rawPayload: RAW }, laps: LAPS, streams: STREAMS });
    expect(detail.provider).toBe("STRAVA");
    expect(detail.laps).toHaveLength(1);
    expect(detail.laps[0]).toMatchObject({ lapNumber: 1, durationSeconds: 600, distanceMeters: 2000, averageSpeed: 3.3, averageHeartRate: 140.4, calories: null });
    expect(detail.streams.map((stream) => stream.key).sort()).toEqual(["heartRate", "latlng", "temperature", "time"]);
    expect(detail.streams.find((stream) => stream.key === "latlng")!.values[1]).toEqual([-23.51, -46.61]);
    expect(detail.zones).toEqual([]); // o core deriva, o Strava não tem zonas nativas
    expect(detail.stats).toMatchObject({ timerSeconds: 1800, elapsedSeconds: 1900, averageTemperature: 22.5, routePolyline: "abc", startLatitude: -23.5, endLongitude: -46.62, subSportType: "TrailRun" });
    expect(detail.stats.averageSwolf).toBeNull();
    expect(detail.sources).toEqual({
      laps: { provider: "STRAVA", kind: "native" }, streams: { provider: "STRAVA", kind: "native" }, stats: { provider: "STRAVA", kind: "native" },
    });
  });

  it("payload sem mapa/temperatura: stats ausentes, não zero", () => {
    const stats = statsFromPayload({ moving_time: 100 });
    expect(stats.routePolyline).toBeNull();
    expect(stats.averageTemperature).toBeNull();
    expect(stats.timerSeconds).toBe(100);
  });
});

describe("fetchStravaActivityDetail", () => {
  it("reaproveita as laps persistidas (uma chamada só) e pede os streams com as chaves de ingestão", async () => {
    const client = { getActivityLaps: vi.fn().mockResolvedValue(LAP_DTOS), getActivityStreams: vi.fn().mockResolvedValue(STREAMS) };
    const cached = { stravaActivityDetails: { laps: [{ index: 1, durationSeconds: 600, distanceMeters: 2000, averageHeartRate: 140, averageCadence: null, averageSpeed: 3.3, averageWatts: null }] } };

    const detail = await fetchStravaActivityDetail(client, { connectionId: "c", userId: "u" }, { externalId: "9", rawPayload: RAW, metrics: cached });

    expect(client.getActivityLaps).not.toHaveBeenCalled();
    expect(client.getActivityStreams).toHaveBeenCalledWith({ connectionId: "c", userId: "u" }, "9", { keys: STRAVA_INGEST_STREAM_KEYS });
    expect(detail.laps[0]!.durationSeconds).toBe(600);

    await fetchStravaActivityDetail(client, { connectionId: "c", userId: "u" }, { externalId: "9", rawPayload: RAW, metrics: null });
    expect(client.getActivityLaps).toHaveBeenCalledTimes(1);
  });
});
