/**
 * SAM-39 — o modelo rico volta ao DTO canônico, um por provider que gravou,
 * preservando proveniência (NATIVE/DERIVED) e lacunas das séries.
 */
import { describe, expect, it, vi } from "vitest";
import { loadPersistedActivityDetail } from "@/modules/shared/activities/detail-ingestion";

describe("loadPersistedActivityDetail", () => {
  it("agrupa por sourceProvider e reconstrói laps, conjuntos de zonas e séries", async () => {
    const db = {
      activityLap: { findMany: vi.fn().mockResolvedValue([
        { activityId: "a", lapNumber: 1, sourceProvider: "GARMIN", sourceKind: "NATIVE", startedAt: null, durationSeconds: 600, movingSeconds: null, distanceMeters: 2000, averagePace: null, averageSpeed: null, averageHeartRate: 140, maxHeartRate: null, averageCadence: null, averageStrokeRate: null, maxStrokeRate: null, averageDistancePerStroke: null, averagePower: null, calories: null, averageTemperature: null },
      ]) },
      activityZone: { findMany: vi.fn().mockResolvedValue([
        { activityId: "a", zoneType: "HEART_RATE", zoneNumber: 1, label: "Z1", lowerBound: null, upperBound: null, durationSeconds: 100, sourceProvider: "STRAVA", sourceKind: "DERIVED", configurationRef: "max-hr:185" },
        { activityId: "a", zoneType: "HEART_RATE", zoneNumber: 2, label: "Z2", lowerBound: null, upperBound: null, durationSeconds: 200, sourceProvider: "STRAVA", sourceKind: "DERIVED", configurationRef: "max-hr:185" },
      ]) },
      activityStream: { findMany: vi.fn().mockResolvedValue([
        { activityId: "a", key: "HEART_RATE", sourceProvider: "STRAVA", sourceKind: "NATIVE", sampleCount: 2, values: [120, null, 150] },
      ]) },
    };

    const result = await loadPersistedActivityDetail(db as never, { id: "a", externalId: "x" });

    expect(result.map((entry) => entry.provider).sort()).toEqual(["GARMIN", "STRAVA"]);
    const garmin = result.find((entry) => entry.provider === "GARMIN")!.detail;
    expect(garmin.laps).toHaveLength(1);
    expect(garmin.laps[0]).toMatchObject({ lapNumber: 1, durationSeconds: 600, averageHeartRate: 140 });
    expect(garmin.zones).toEqual([]);
    expect(garmin.sources).toEqual({ laps: { provider: "GARMIN", kind: "native" } });

    const strava = result.find((entry) => entry.provider === "STRAVA")!.detail;
    expect(strava.laps).toEqual([]);
    expect(strava.zones).toHaveLength(1);
    expect(strava.zones[0]).toMatchObject({ zoneType: "HEART_RATE", source: { provider: "STRAVA", kind: "derived" }, configurationRef: "max-hr:185" });
    expect(strava.zones[0]!.zones.map((zone) => zone.durationSeconds)).toEqual([100, 200]);
    expect(strava.streams).toEqual([{ key: "heartRate", values: [120, null, 150], source: { provider: "STRAVA", kind: "native" } }]);
    expect(strava.sources).toEqual({ zones: { provider: "STRAVA", kind: "derived" }, streams: { provider: "STRAVA", kind: "native" } });
  });

  it("sem linhas → lista vazia", async () => {
    const db = {
      activityLap: { findMany: vi.fn().mockResolvedValue([]) },
      activityZone: { findMany: vi.fn().mockResolvedValue([]) },
      activityStream: { findMany: vi.fn().mockResolvedValue([]) },
    };
    expect(await loadPersistedActivityDetail(db as never, { id: "a", externalId: "x" })).toEqual([]);
  });
});
