/**
 * SAM-39 — Garmin → NormalizedActivityDetail a partir do resumo e dos splits
 * persistidos: zonas nativas, voltas, stats proprietárias rotuladas; nada inventado.
 */
import { describe, expect, it } from "vitest";
import { buildGarminActivityDetail } from "@/modules/garmin/application/activities/garmin-activity-detail-provider";

const SUMMARY = {
  activityType: { typeKey: "open_water_swimming" },
  duration: 1477, elapsedDuration: 1500, bmrCalories: 30, waterEstimated: 420,
  strokes: 540, averageSwimCadenceInStrokesPerMinute: 28, averageSwolf: 41, averageStrokeDistance: 1.24,
  minTemperature: 21, maxTemperature: 23, activityTrainingLoad: 48.2,
  aerobicTrainingEffect: 2.9, aerobicTrainingEffectMessage: "Mantendo a base aeróbica", anaerobicTrainingEffect: 0.4,
  differenceBodyBattery: -18, startLatitude: -23.9, startLongitude: -46.3,
  hrTimeInZone_1: 120, hrTimeInZone_2: 600, hrTimeInZone_3: 500, hrTimeInZone_4: 200, hrTimeInZone_5: 57,
  garminActivityDetails: {
    typedSplits: [],
    splits: [
      { lapIndex: 1, duration: 740, distance: 336, averageHR: 138, maxHR: 150, averageSpeed: 0.45, averageSwimCadenceInStrokesPerMinute: 27 },
      { lapIndex: 2, duration: 737, distance: 336, averageHR: 142, maxHR: 155, averageSpeed: 0.46 },
    ],
    splitSummaries: [],
  },
};

describe("buildGarminActivityDetail", () => {
  it("voltas dos splits, zonas de FC nativas e stats de natação/efeito/Body Battery rotuladas", () => {
    const detail = buildGarminActivityDetail({ externalId: "g1", metrics: SUMMARY })!;
    expect(detail.provider).toBe("GARMIN");
    expect(detail.laps).toHaveLength(2);
    expect(detail.laps[0]).toMatchObject({ lapNumber: 1, durationSeconds: 740, distanceMeters: 336, averageHeartRate: 138, maxHeartRate: 150, averageStrokeRate: 27 });
    expect(detail.zones).toHaveLength(1);
    expect(detail.zones[0]).toMatchObject({ zoneType: "HEART_RATE", source: { provider: "GARMIN", kind: "native" } });
    expect(detail.zones[0]!.zones.map((zone) => zone.durationSeconds)).toEqual([120, 600, 500, 200, 57]);
    expect(detail.stats).toMatchObject({
      timerSeconds: 1477, elapsedSeconds: 1500, caloriesResting: 30, estimatedSweatLossMl: 420,
      totalStrokes: 540, averageStrokeRate: 28, averageSwolf: 41, averageDistancePerStroke: 1.24,
      minTemperature: 21, maxTemperature: 23, trainingLoad: 48.2, aerobicEffect: 2.9, aerobicEffectLabel: "Mantendo a base aeróbica",
      anaerobicEffect: 0.4, energyImpact: -18, energyLabel: "Body Battery", startLatitude: -23.9, subSportType: "open_water_swimming",
    });
    expect(detail.stats.caloriesActive).toBeNull();
    expect(detail.streams).toEqual([]);
    expect(detail.sources).toEqual({
      laps: { provider: "GARMIN", kind: "native" }, zones: { provider: "GARMIN", kind: "native" }, stats: { provider: "GARMIN", kind: "native" },
    });
  });

  it("resumo sem nada aproveitável → null; zonas todas zero não viram conjunto", () => {
    expect(buildGarminActivityDetail({ externalId: "g2", metrics: { activityName: "x" } })).toBeNull();
    const detail = buildGarminActivityDetail({ externalId: "g3", metrics: { hrTimeInZone_1: 0, hrTimeInZone_2: 0, strokes: 10 } })!;
    expect(detail.zones).toEqual([]);
    expect(detail.stats.totalStrokes).toBe(10);
  });
});
