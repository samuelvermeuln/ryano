import { describe, expect, it, vi } from "vitest";

import {
  runStravaDailyMaintenanceJob,
  runStravaWebhookJob,
} from "@/modules/strava/application/jobs/run-strava-jobs";

describe("Strava job scheduling", () => {
  it("processes pending webhook events without running the full sync", async () => {
    const processWebhookEvents = vi.fn().mockResolvedValue({
      total: 1,
      processed: 1,
      ignored: 0,
      retried: 0,
      failed: 0,
    });

    const result = await runStravaWebhookJob({ processWebhookEvents });

    expect(result).toEqual({
      ok: true,
      webhook: {
        ok: true,
        result: {
          total: 1,
          processed: 1,
          ignored: 0,
          retried: 0,
          failed: 0,
        },
      },
      errors: [],
    });
    expect(processWebhookEvents).toHaveBeenCalledOnce();
  });

  it("runs sync and retention without polling webhook events", async () => {
    const syncAllUsers = vi.fn().mockResolvedValue({ totalConnections: 1 });
    const runRetentionCleanup = vi.fn().mockResolvedValue({ errors: [] });

    const result = await runStravaDailyMaintenanceJob({
      syncAllUsers,
      runRetentionCleanup,
    });

    expect(result).toEqual({
      ok: true,
      sync: { ok: true, result: { totalConnections: 1 } },
      cleanup: { ok: true, result: { errors: [] } },
      errors: [],
    });
    expect(syncAllUsers).toHaveBeenCalledOnce();
    expect(runRetentionCleanup).toHaveBeenCalledOnce();
  });

  it("still runs retention when the daily sync fails", async () => {
    const syncAllUsers = vi.fn().mockRejectedValue(new Error("sync unavailable"));
    const runRetentionCleanup = vi.fn().mockResolvedValue({ errors: [] });

    const result = await runStravaDailyMaintenanceJob({
      syncAllUsers,
      runRetentionCleanup,
    });

    expect(result).toEqual({
      ok: false,
      sync: { ok: false, error: "sync:Error" },
      cleanup: { ok: true, result: { errors: [] } },
      errors: ["sync:Error"],
    });
    expect(runRetentionCleanup).toHaveBeenCalledOnce();
  });
});
