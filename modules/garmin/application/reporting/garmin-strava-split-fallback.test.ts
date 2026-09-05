import { WearableProvider } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findEquivalentPersistedStravaActivity: vi.fn(),
}));

vi.mock("@/modules/strava/application/reporting/strava-split-fallback", () => ({
  findEquivalentPersistedStravaActivity: mocks.findEquivalentPersistedStravaActivity,
}));

import { getGarminPostActivitySplits } from "@/modules/garmin/application/reporting/garmin-reporting";

describe("Garmin report Strava fallback", () => {
  it("uses persisted laps from one equivalent Strava activity when Garmin has no cached splits", async () => {
    mocks.findEquivalentPersistedStravaActivity.mockResolvedValue({
      id: "strava_open_water",
      metrics: {
        stravaActivityDetails: {
          laps: [{ index: 1, distanceMeters: 400, durationSeconds: 480 }],
        },
      },
    });

    await expect(getGarminPostActivitySplits({
      provider: WearableProvider.GARMIN,
      userId: "user_1",
      sportType: "open-water",
      startedAt: new Date("2026-08-26T06:00:00Z"),
      distanceMeters: 1_200,
      durationSeconds: 1_800,
      metrics: { activityName: "Open Water" },
    })).resolves.toEqual({
      splitLabel: "Parciais (voltas · Strava)",
      splitUnit: "/100 m",
      splits: [{ label: "Volta 1", value: "2:00", seconds: 480 }],
    });
  });
});
