import { describe, expect, it } from "vitest";
import { WearableProvider } from "@prisma/client";

import * as garminSplitMappers from "@/modules/garmin/application/reporting/garmin-multisport-legs";
import { getGarminPostActivitySplits } from "@/modules/garmin/application/reporting/garmin-reporting";
import { buildGarminMultisportLegs } from "@/modules/garmin/application/reporting/garmin-multisport-legs";

describe("buildGarminMultisportLegs", () => {
  it("preserves the actual swim, bike, and run information for a triathlon", () => {
    const legs = buildGarminMultisportLegs([
      { activityType: { typeKey: "swimming" }, distance: 750, duration: 840 },
      { activityType: { typeKey: "cycling" }, distance: 20_000, duration: 2_100 },
      { activityType: { typeKey: "running" }, distance: 5_000, duration: 1_350 },
    ]);

    expect(legs).toEqual([
      { type: "activity", sport: "natacao", distance: "750 m", time: "14:00", pace: "1:52 /100 m" },
      { type: "activity", sport: "ciclismo", distance: "20,0 km", time: "35:00", pace: "34,3 km/h" },
      { type: "activity", sport: "corrida", distance: "5,0 km", time: "22:30", pace: "4:30 /km" },
    ]);
  });

  it("omits unknown or incomplete typed splits instead of inventing a modality", () => {
    expect(buildGarminMultisportLegs([
      { activityType: { typeKey: "transition" }, duration: 90 },
      { activityType: { typeKey: "running" }, distance: 5_000 },
    ])).toEqual([]);
  });

  it("maps real running laps into the single-sport post-activity split contract", () => {
    const buildSplits = (garminSplitMappers as Record<string, unknown>).buildGarminPostActivitySplits;

    expect(buildSplits).toBeTypeOf("function");
    if (typeof buildSplits !== "function") {
      throw new Error("Expected the Garmin post-activity split mapper");
    }

    expect(buildSplits([
      { activityType: { typeKey: "running" }, lapIndex: 0, distance: 1_000, duration: 312 },
      { activityType: { typeKey: "running" }, lapIndex: 1, distance: 1_000, duration: 304 },
      { activityType: { typeKey: "running" }, lapIndex: 2, distance: 1_000, duration: 308 },
    ], "run")).toEqual({
      splitLabel: "Parciais (km)",
      splitUnit: "/km",
      splits: [
        { label: "Km 1", value: "5:12", seconds: 312 },
        { label: "Km 2", value: "5:04", seconds: 304 },
        { label: "Km 3", value: "5:08", seconds: 308 },
      ],
    });
  });

  it("converts canonical cycling split speed from m/s to km/h", () => {
    const buildSplits = (garminSplitMappers as Record<string, unknown>).buildGarminPostActivitySplits;

    expect(buildSplits).toBeTypeOf("function");
    if (typeof buildSplits !== "function") {
      throw new Error("Expected the Garmin post-activity split mapper");
    }

    expect(buildSplits([
      { activityType: { typeKey: "cycling" }, lapIndex: 0, distance: 5_000, duration: 600, averageSpeed: 8.33 },
    ], "cycling")).toEqual({
      splitLabel: "Parciais",
      splitUnit: "km/h",
      splits: [{ label: "Split 1", value: "30,0", seconds: 600 }],
    });
  });

  it("reads cached Garmin swim laps without calling the provider again", () => {
    const buildCachedSplits = (garminSplitMappers as Record<string, unknown>).buildPersistedGarminPostActivitySplits;

    expect(buildCachedSplits).toBeTypeOf("function");
    if (typeof buildCachedSplits !== "function") {
      throw new Error("Expected the persisted Garmin post-activity split mapper");
    }

    expect(buildCachedSplits({
      garminActivityDetails: {
        typedSplits: [
          { lapIndex: 0, distance: 400, duration: 480 },
          { lapIndex: 1, distance: 400, duration: 500 },
        ],
      },
    }, "open-water")).toEqual({
      splitLabel: "Parciais (voltas)",
      splitUnit: "/100 m",
      splits: [
        { label: "Volta 1", value: "2:00", seconds: 480 },
        { label: "Volta 2", value: "2:05", seconds: 500 },
      ],
    });
  });

  it("builds the report splits from Activity.metrics without Garmin identifiers", async () => {
    await expect(getGarminPostActivitySplits({
      provider: WearableProvider.GARMIN,
      sportType: "open-water",
      metrics: {
        garminActivityDetails: {
          typedSplits: [{ lapIndex: 0, distance: 400, duration: 480 }],
        },
      },
    })).resolves.toEqual({
      splitLabel: "Parciais (voltas)",
      splitUnit: "/100 m",
      splits: [{ label: "Volta 1", value: "2:00", seconds: 480 }],
    });
  });
});
