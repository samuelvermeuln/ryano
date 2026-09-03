import { describe, expect, it } from "vitest";

import { getDailyGarminDeliveryDecision } from "@/modules/garmin/application/reporting/daily-summary-scheduling";

describe("getDailyGarminDeliveryDecision", () => {
  it("waits when physiological readings are incomplete", () => {
    expect(getDailyGarminDeliveryDecision(false)).toEqual({ action: "wait" });
  });

  it("queues the daily summary when all required readings are available", () => {
    expect(getDailyGarminDeliveryDecision(true)).toEqual({ action: "queue-summary" });
  });
});
