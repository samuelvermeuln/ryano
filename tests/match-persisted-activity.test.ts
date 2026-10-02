/**
 * SAM-33 — o gancho pós-persistência que todo provider chama.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const constructorSpy = vi.fn();

vi.mock("@/modules/school/application/trigger-workout-matching", () => ({
  TriggerWorkoutMatching: class {
    constructor(...args: unknown[]) { constructorSpy(...args); }
    execute = execute;
  },
}));

vi.mock("@/modules/shared/integrations/observability/log", () => ({
  logIntegrationEvent: vi.fn(),
}));

import { logIntegrationEvent } from "@/modules/shared/integrations/observability/log";
import { executionSourceVariants, matchPersistedActivity } from "@/modules/school/application/match-persisted-activity";

const ACTIVITY = {
  id: "act-1",
  userId: "athlete-1",
  wearableConnectionId: "conn-1",
  provider: "STRAVA" as const,
  externalId: "123",
  sportType: "swim",
  providerSportType: "Swim",
  startedAt: new Date("2026-10-02T10:00:00.000Z"),
  durationSeconds: 1477,
  movingSeconds: 1400,
  distanceMeters: 672,
  averageHeartRate: 140,
  maxHeartRate: null,
  averageSpeed: 0.455,
  elevationGain: null,
  averagePower: null,
  rawPayload: { name: "Serra Natação em alto mar" },
};

function makeDb(existing: unknown = null) {
  return { workoutExecution: { findFirst: vi.fn().mockResolvedValue(existing) } };
}

beforeEach(() => {
  execute.mockReset();
  constructorSpy.mockReset();
  vi.mocked(logIntegrationEvent).mockReset();
});

describe("matchPersistedActivity", () => {
  it("traduz a Activity para o ActivitySummary do matching (nulos viram ausência) e injeta o leitor de laps", async () => {
    const db = makeDb();
    execute.mockResolvedValue({ skipped: false, matched: true, matchStatus: "AUTO_MATCHED", matchScore: 91, workoutAssignmentId: "as-1" });
    const loadDetail = vi.fn();
    const clock = () => new Date("2026-10-02T12:00:00.000Z");

    const result = await matchPersistedActivity(db as never, ACTIVITY, { loadDetail, clock });

    expect(result).toMatchObject({ skipped: false, matchStatus: "AUTO_MATCHED" });
    expect(constructorSpy).toHaveBeenCalledWith(db, clock, loadDetail);
    expect(execute).toHaveBeenCalledWith("athlete-1", {
      source: "STRAVA", externalId: "123", sportType: "swim", providerSportType: "Swim",
      startedAt: ACTIVITY.startedAt, durationSeconds: 1477, movingSeconds: 1400, distanceMeters: 672,
      averageHeartRate: 140, maxHeartRate: undefined, averageSpeed: 0.455, elevationGain: undefined,
      averagePower: undefined, raw: { name: "Serra Natação em alto mar" },
    });
    expect(vi.mocked(logIntegrationEvent)).toHaveBeenCalledWith("info", expect.any(String), expect.objectContaining({
      provider: "STRAVA", operation: "activity_matching", status: "AUTO_MATCHED", connectionId: "conn-1", activityId: "act-1",
    }));
  });

  it("re-sync: uma atividade que já tem execução (qualquer status, source em qualquer caixa) é pulada sem casar de novo", async () => {
    const db = makeDb({ id: "exec-1" });

    const result = await matchPersistedActivity(db as never, ACTIVITY);

    expect(result).toEqual({ skipped: true, reason: "ALREADY_LINKED" });
    expect(execute).not.toHaveBeenCalled();
    expect(db.workoutExecution.findFirst).toHaveBeenCalledWith({
      where: { athleteId: "athlete-1", externalId: "123", source: { in: ["STRAVA", "strava"] } },
      select: { id: true },
    });
    expect(executionSourceVariants("GARMIN")).toEqual(["GARMIN", "garmin"]);
  });

  it("sem prescrição compatível a atividade fica não planejada e o resultado diz por quê", async () => {
    execute.mockResolvedValue({ skipped: true, reason: "NO_CANDIDATES" });

    const result = await matchPersistedActivity(makeDb() as never, ACTIVITY);

    expect(result).toEqual({ skipped: true, reason: "NO_CANDIDATES" });
    expect(vi.mocked(logIntegrationEvent)).toHaveBeenCalledWith("info", expect.any(String), expect.objectContaining({ status: "NO_CANDIDATES" }));
  });

  it("nunca lança: falha do banco vira resultado pulado e log de aviso, sem derrubar a sync", async () => {
    const db = { workoutExecution: { findFirst: vi.fn().mockRejectedValue(new Error("db down")) } };

    const result = await matchPersistedActivity(db as never, ACTIVITY);

    expect(result).toEqual({ skipped: true, reason: "MATCHING_ERROR" });
    expect(vi.mocked(logIntegrationEvent)).toHaveBeenCalledWith("warn", expect.any(String), expect.objectContaining({ status: "error", provider: "STRAVA" }));
  });
});
