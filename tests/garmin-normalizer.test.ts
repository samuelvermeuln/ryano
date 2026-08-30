import { describe, expect, it } from "vitest";

import { normalizeGarminActivity } from "@/modules/garmin";

describe("normalizeGarminActivity", () => {
  it("maps external payload to internal model", () => {
    const activity = normalizeGarminActivity({
      activityId: 123,
      activityName: "Corrida leve",
      sportType: "running",
      startTimeLocal: "2026-01-10T10:00:00.000Z",
      durationSeconds: 1800,
      distance: 5000,
      averageHeartRate: 150,
    });

    expect(activity.externalId).toBe("123");
    expect(activity.provider).toBe("GARMIN");
    expect(activity.name).toBe("Corrida leve");
    expect(activity.durationSeconds).toBe(1800);
    expect(activity.distanceMeters).toBe(5000);
    expect(activity.averageHeartRate).toBe(150);
  });
});
