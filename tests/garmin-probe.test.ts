import { describe, expect, it } from "vitest";

import {
  getGarminActivityExternalIdForProbe,
  getGarminProbeIntervalMs,
  getNextGarminProbeErrorAt,
  isRecentGarminActivityForReport,
  shouldRunGarminSyncForProbe,
} from "@/server/services/garmin-service";

describe("garmin activity probe", () => {
  it("does not run full sync when latest activity did not change", () => {
    expect(
      shouldRunGarminSyncForProbe({
        latestActivityExternalId: "24108314422",
        lastSeenActivityExternalId: "24108314422",
        activityAlreadyStored: true,
      }),
    ).toBe(false);
  });

  it("runs full sync when latest activity is new and not stored yet", () => {
    expect(
      shouldRunGarminSyncForProbe({
        latestActivityExternalId: "24108314422",
        lastSeenActivityExternalId: "old",
        activityAlreadyStored: false,
      }),
    ).toBe(true);
  });

  it("does not run full sync when changed id is already imported", () => {
    expect(
      shouldRunGarminSyncForProbe({
        latestActivityExternalId: "24108314422",
        lastSeenActivityExternalId: "old",
        activityAlreadyStored: true,
      }),
    ).toBe(false);
  });

  it("extracts Garmin activity ids from common payload shapes", () => {
    expect(getGarminActivityExternalIdForProbe({ activityId: 24108314422 })).toBe("24108314422");
    expect(getGarminActivityExternalIdForProbe({ id: "abc" })).toBe("abc");
    expect(getGarminActivityExternalIdForProbe(null)).toBeNull();
  });

  it("uses 60s probes only for verified WhatsApp post-activity reports", () => {
    expect(
      getGarminProbeIntervalMs({
        user: {
          whatsappIdentity: { verifiedAt: new Date("2026-08-25T12:00:00.000Z") },
          notificationPreference: { enabled: true, postActivityReport: true },
        },
      }),
    ).toBe(60_000);

    expect(
      getGarminProbeIntervalMs({
        user: {
          whatsappIdentity: null,
          notificationPreference: { enabled: true, postActivityReport: true },
        },
      }),
    ).toBe(15 * 60_000);
  });

  it("applies progressive error backoff", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");

    expect(getNextGarminProbeErrorAt(now, 1).toISOString()).toBe("2026-08-25T12:05:00.000Z");
    expect(getNextGarminProbeErrorAt(now, 2).toISOString()).toBe("2026-08-25T12:15:00.000Z");
    expect(getNextGarminProbeErrorAt(now, 3).toISOString()).toBe("2026-08-25T12:30:00.000Z");
    expect(getNextGarminProbeErrorAt(now, 99).toISOString()).toBe("2026-08-25T13:00:00.000Z");
  });

  it("only queues post-activity reports for recent Garmin activities", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");

    expect(
      isRecentGarminActivityForReport({
        startedAt: new Date("2026-08-26T09:00:00.000Z"),
        now,
      }),
    ).toBe(true);

    expect(
      isRecentGarminActivityForReport({
        startedAt: new Date("2026-08-24T09:00:00.000Z"),
        now,
      }),
    ).toBe(false);
  });
});
