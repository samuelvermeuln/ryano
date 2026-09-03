import { describe, expect, it } from "vitest";

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
});
