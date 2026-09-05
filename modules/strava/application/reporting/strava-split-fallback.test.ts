import { describe, expect, it } from "vitest";

import * as fallback from "@/modules/strava/application/reporting/strava-split-fallback";

const primary = {
  sportType: "open-water",
  startedAt: new Date("2026-08-26T06:00:00Z"),
  distanceMeters: 1_200,
  durationSeconds: 1_800,
};

describe("Strava split fallback matching", () => {
  it("selects the single equivalent Strava swim without merging activity metrics", () => {
    const select = (fallback as Record<string, unknown>).selectEquivalentStravaActivity;

    expect(select).toBeTypeOf("function");
    if (typeof select !== "function") {
      throw new Error("Expected the strict Strava fallback selector");
    }

    const strava = {
      id: "strava_open_water",
      sportType: "swim",
      startedAt: new Date("2026-08-26T06:02:00Z"),
      distanceMeters: 1_180,
      durationSeconds: 1_785,
      metrics: {},
    };

    expect(select(primary, [strava])).toEqual(strava);
  });

  it("rejects ambiguous or materially different candidates", () => {
    const select = (fallback as Record<string, unknown>).selectEquivalentStravaActivity;
    if (typeof select !== "function") {
      throw new Error("Expected the strict Strava fallback selector");
    }

    const equivalent = {
      id: "strava_a",
      sportType: "swim",
      startedAt: new Date("2026-08-26T06:02:00Z"),
      distanceMeters: 1_180,
      durationSeconds: 1_785,
      metrics: {},
    };

    expect(select(primary, [
      equivalent,
      { ...equivalent, id: "strava_b", startedAt: new Date("2026-08-26T06:03:00Z") },
    ])).toBeNull();
    expect(select(primary, [{ ...equivalent, distanceMeters: 2_000 }])).toBeNull();
  });
});
