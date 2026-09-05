import { describe, expect, it } from "vitest";

import * as stravaLapCache from "@/modules/strava/application/activities/strava-activity-laps-cache";

describe("Strava activity lap cache", () => {
  it("marks a legacy Strava activity without persisted laps for backfill", () => {
    const needsBackfill = (stravaLapCache as Record<string, unknown>).needsStravaActivityLapBackfill;

    expect(needsBackfill).toBeTypeOf("function");
    if (typeof needsBackfill !== "function") {
      throw new Error("Expected the Strava lap backfill predicate");
    }

    expect(needsBackfill({ activityName: "Open Water" })).toBe(true);
    expect(needsBackfill({ stravaActivityDetails: { laps: [] } })).toBe(false);
  });

  it("preserves a cached Strava lap payload when a later summary sync updates metrics", () => {
    const preserveCache = (stravaLapCache as Record<string, unknown>).preserveStravaActivityLapCache;

    expect(preserveCache).toBeTypeOf("function");
    if (typeof preserveCache !== "function") {
      throw new Error("Expected the Strava lap cache merge helper");
    }

    expect(preserveCache(
      { activityName: "Open Water", calories: 649 },
      { stravaActivityDetails: { laps: [{ index: 1, durationSeconds: 480, distanceMeters: 400 }] } },
    )).toEqual({
      activityName: "Open Water",
      calories: 649,
      stravaActivityDetails: { laps: [{ index: 1, durationSeconds: 480, distanceMeters: 400 }] },
    });
  });
});
