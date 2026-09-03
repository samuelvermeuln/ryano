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
});
