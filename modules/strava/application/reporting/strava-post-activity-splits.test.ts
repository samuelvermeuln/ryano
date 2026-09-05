import { describe, expect, it } from "vitest";

import * as stravaReportSplits from "@/modules/strava/application/reporting/strava-post-activity-splits";

describe("persisted Strava report splits", () => {
  it("maps persisted open-water laps into the post-activity contract with explicit source provenance", () => {
    const buildSplits = (stravaReportSplits as Record<string, unknown>).buildPersistedStravaPostActivitySplits;

    expect(buildSplits).toBeTypeOf("function");
    if (typeof buildSplits !== "function") {
      throw new Error("Expected the persisted Strava report split mapper");
    }

    expect(buildSplits({
      stravaActivityDetails: {
        laps: [
          { index: 1, distanceMeters: 400, durationSeconds: 480 },
          { index: 2, distanceMeters: 400, durationSeconds: 500 },
        ],
      },
    }, "open-water")).toEqual({
      splitLabel: "Parciais (voltas · Strava)",
      splitUnit: "/100 m",
      splits: [
        { label: "Volta 1", value: "2:00", seconds: 480 },
        { label: "Volta 2", value: "2:05", seconds: 500 },
      ],
    });
  });
});
