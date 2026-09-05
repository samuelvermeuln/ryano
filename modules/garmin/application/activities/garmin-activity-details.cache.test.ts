import { describe, expect, it } from "vitest";

import * as activityDetails from "@/modules/garmin/application/activities/garmin-activity-details";

describe("Garmin activity split cache", () => {
  it("marks a legacy activity without cached detail payloads for split backfill", () => {
    const needsBackfill = (activityDetails as Record<string, unknown>).needsGarminActivitySplitBackfill;

    expect(needsBackfill).toBeTypeOf("function");
    if (typeof needsBackfill !== "function") {
      throw new Error("Expected the Garmin split backfill predicate");
    }

    expect(needsBackfill({ activityName: "Open Water" })).toBe(true);
    expect(needsBackfill({
      garminActivityDetails: {
        typedSplits: [],
        splits: [],
        splitSummaries: [],
      },
    })).toBe(false);
  });
});
