import { describe, expect, it } from "vitest";

import { buildPostActivityWhatsAppReport } from "@/server/services/report-builder";

describe("buildPostActivityWhatsAppReport", () => {
  it("uses every real leg for a triathlon instead of collapsing it into one sport", () => {
    const report = buildPostActivityWhatsAppReport({
      user: { name: "Marina Costa", image: null },
      activity: {
        sportType: "triathlon",
        name: "Triathlon Sprint",
        startedAt: new Date("2026-09-02T10:00:00Z"),
        durationSeconds: 4_380,
        distanceMeters: 25_750,
        calories: 980,
        averageHeartRate: 156,
        maxHeartRate: null,
        averagePace: null,
        averageSpeed: null,
        elevationGain: 210,
        averageCadence: null,
        averagePower: null,
      },
      multisportLegs: [
        { type: "activity", sport: "natacao", distance: "750 m", time: "14:00", pace: "1:52 /100 m" },
        { type: "activity", sport: "ciclismo", distance: "20,0 km", time: "35:00", pace: "34,3 km/h" },
        { type: "activity", sport: "corrida", distance: "5,0 km", time: "22:30", pace: "4:30 /km" },
      ],
      heartRateZones: [
        { label: "Zona 1", value: "12:30", ratio: 0.21, color: "#38BDF8" },
      ],
    });

    expect(report.request.data).toMatchObject({
      variant: "multi",
      combo: "triatlo",
      legs: [
        expect.objectContaining({ sport: "natacao", distance: "750 m" }),
        expect.objectContaining({ sport: "ciclismo", distance: "20,0 km" }),
        expect.objectContaining({ sport: "corrida", distance: "5,0 km" }),
      ],
      heartRateZones: [{ label: "Zona 1", value: "12:30", ratio: 0.21, color: "#38BDF8" }],
    });
    expect(report.fileName).toMatch(/\.png$/);
  });

  it("preserves real single-sport splits supplied by the activity materializer", () => {
    const reportInput = {
      user: { name: "Marina Costa", image: null },
      activity: {
        sportType: "run",
        name: "Treino de ritmo",
        startedAt: new Date("2026-09-04T06:15:00Z"),
        durationSeconds: 1_536,
        distanceMeters: 5_000,
        calories: 420,
        averageHeartRate: 154,
        maxHeartRate: 181,
        averagePace: 307,
        averageSpeed: 3.26,
        elevationGain: 42,
        averageCadence: 168,
        averagePower: null,
      },
      splitLabel: "Parciais (km)",
      splitUnit: "/km",
      splits: [
        { label: "Km 1", value: "5:12", seconds: 312 },
        { label: "Km 2", value: "5:04", seconds: 304 },
        { label: "Km 3", value: "5:08", seconds: 308 },
      ],
    };

    const report = buildPostActivityWhatsAppReport(reportInput);

    expect(report.request.data).toMatchObject({
      variant: "single",
      splitLabel: "Parciais (km)",
      splitUnit: "/km",
      splits: reportInput.splits,
    });
  });

  it("formats canonical running metrics instead of placeholders or raw seconds", () => {
    const activity = {
      sportType: "run",
      name: "Treino de ritmo",
      startedAt: new Date("2026-09-04T06:15:00Z"),
      durationSeconds: 2_671,
      distanceMeters: 8_400,
      calories: 640,
      averageHeartRate: 154,
      maxHeartRate: 181,
      averagePace: 318,
      averageSpeed: 3.14,
      elevationGain: 92,
      averageCadence: 168,
      averagePower: null,
    };

    const report = buildPostActivityWhatsAppReport({
      user: { name: "Marina Costa", image: null },
      activity,
    });

    expect(report.request.data).toMatchObject({
      variant: "single",
      secondaryMetrics: [
        { label: "FC MÉDIA", value: "154", unit: "bpm" },
        { label: "FC MÁXIMA", value: "181", unit: "bpm" },
        { label: "CALORIAS", value: "640", unit: "kcal" },
        { label: "RITMO", value: "5:18", unit: "/km" },
      ],
    });
  });

  it("uses canonical cycling speed for the secondary performance metric", () => {
    const activity = {
      sportType: "cycling",
      name: "Pedal longo",
      startedAt: new Date("2026-09-04T06:15:00Z"),
      durationSeconds: 3_600,
      distanceMeters: 30_000,
      calories: 880,
      averageHeartRate: 146,
      maxHeartRate: 171,
      averagePace: null,
      averageSpeed: 8.33,
      elevationGain: 420,
      averageCadence: 86,
      averagePower: 212,
    };

    const report = buildPostActivityWhatsAppReport({
      user: { name: "Marina Costa", image: null },
      activity,
    });

    if (!("variant" in report.request.data) || report.request.data.variant !== "single") {
      throw new Error("Expected a single post-activity report");
    }

    expect(report.request.data.secondaryMetrics).toContainEqual(
      expect.objectContaining({
        label: "VELOCIDADE",
        value: "30,0",
        unit: "km/h",
      }),
    );
  });

  it("uses the canonical per-100 m pace for swimming", () => {
    const activity = {
      sportType: "swimming",
      name: "Natação na piscina",
      startedAt: new Date("2026-09-04T06:15:00Z"),
      durationSeconds: 2_000,
      distanceMeters: 2_000,
      calories: 350,
      averageHeartRate: 132,
      maxHeartRate: 154,
      averagePace: 100,
      averageSpeed: 1,
      elevationGain: null,
      averageCadence: null,
      averagePower: null,
    };

    const report = buildPostActivityWhatsAppReport({
      user: { name: "Marina Costa", image: null },
      activity,
    });

    if (!("variant" in report.request.data) || report.request.data.variant !== "single") {
      throw new Error("Expected a single post-activity report");
    }

    expect(report.request.data.secondaryMetrics).toContainEqual(
      expect.objectContaining({ label: "RITMO", value: "1:40", unit: "/100 m" }),
    );
  });
});
