/**
 * SAM-41 — o atleta lê a própria lista pelo mesmo caso de uso do professor e
 * da escola (escopo `self`): histórico inteiro, toda prescrição é sua, e os
 * filtros por origem, status e busca.
 */
import { describe, expect, it, vi } from "vitest";
import { GetCoachAthleteActivities } from "@/modules/school/application/get-coach-athlete-activities";
import { SchoolError } from "@/modules/school/domain/errors";

const NOW = new Date("2026-10-02T15:00:00.000Z");

const ACTIVITY = (overrides: Record<string, unknown> = {}) => ({
  id: "act-swim", name: "Serra Natação em alto mar", provider: "GARMIN", externalId: "g-swim", sportType: "open-water",
  startedAt: new Date("2026-10-02T10:00:00.000Z"), durationSeconds: 1477, movingSeconds: null, distanceMeters: 672,
  calories: 210, averageHeartRate: 140, maxHeartRate: 160, averagePace: 220, averageSpeed: null, elevationGain: null,
  averageCadence: null, averagePower: null, userId: "athlete", ...overrides,
});

function makeDb(overrides: Record<string, unknown> = {}) {
  const old = ACTIVITY({ id: "act-old", externalId: "g-old", name: "Corrida antiga", sportType: "run", startedAt: new Date("2025-01-10T10:00:00.000Z") });
  const bike = ACTIVITY({ id: "act-bike", externalId: "g-bike", name: "Bike", sportType: "bike", provider: "STRAVA", startedAt: new Date("2026-10-01T10:00:00.000Z") });
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Ana", email: null, image: null }) },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Fortaleza" }) },
    historyAccessGrant: { findMany: vi.fn().mockRejectedValue(new Error("consent must not be consulted for self")) },
    activity: {
      findMany: vi.fn().mockImplementation((args: { distinct?: unknown }) =>
        Promise.resolve(args.distinct ? [{ sportType: "bike" }, { sportType: "open-water" }, { sportType: "run" }] : [ACTIVITY(), bike, old])),
    },
    workoutExecution: {
      findMany: vi.fn().mockResolvedValue([{
        id: "exec-1", activityId: "act-bike", source: "STRAVA", externalId: "g-bike", sportType: "bike",
        startedAt: bike.startedAt, durationSeconds: 2700, distanceMeters: 21000, averageHeartRate: 135, averageSpeed: 7.7,
        // A prescription of a school the athlete left: still theirs to see.
        assignment: { id: "as-1", status: "COMPLETED", schoolId: "other-school", coachId: "other-coach", sourceLabel: null, workout: { title: "Bike 45", sportType: "bike" } },
      }]),
    },
    ...overrides,
  };
}

describe("GetCoachAthleteActivities — scope self (SAM-41)", () => {
  it("histórico inteiro no fuso do atleta; prescrição de qualquer vínculo é dele; duplicatas de outra conexão ficam fora da consulta", async () => {
    const db = makeDb();
    const result = await new GetCoachAthleteActivities(db as never, () => NOW).execute("athlete", { kind: "self" }, "athlete", { days: 730 });

    expect(result.context).toMatchObject({ reader: "athlete", timeZone: "America/Fortaleza", periodStart: new Date(0), schoolId: null, coachId: null });
    expect(result.items.map((item) => [item.id, item.outcome, item.prescription?.title ?? null])).toEqual([
      ["act-swim", "UNPLANNED_ACTIVITY", null],
      ["act-bike", "EXECUTED_AS_PLANNED", "Bike 45"],
      ["act-old", "UNPLANNED_ACTIVITY", null],
    ]);
    expect(result.withheldBeforePeriod).toBe(0);
    expect(db.activity.findMany.mock.calls[0][0].where.duplicateOfActivityId).toBeNull();
    expect(result.items[0]).toMatchObject({ maxHeartRate: 160, averageCadence: null, averagePower: null });
  });

  it("filtros: origem (provider), status e busca sem acento", async () => {
    const run = (raw: Record<string, unknown>) => new GetCoachAthleteActivities(makeDb() as never, () => NOW).execute("athlete", { kind: "self" }, "athlete", { days: 730, ...raw });
    expect((await run({ provider: "STRAVA" })).items.map((item) => item.id)).toEqual(["act-bike"]);
    expect((await run({ outcome: "EXECUTED_AS_PLANNED" })).items.map((item) => item.id)).toEqual(["act-bike"]);
    expect((await run({ q: "natacao" })).items.map((item) => item.id)).toEqual(["act-swim"]);
    expect((await run({ q: "antiga" })).items.map((item) => item.id)).toEqual(["act-old"]);
  });

  it("outro usuário não lê como `self`", async () => {
    await expect(new GetCoachAthleteActivities(makeDb() as never, () => NOW).execute("intruder", { kind: "self" }, "athlete"))
      .rejects.toBeInstanceOf(SchoolError);
  });
});
