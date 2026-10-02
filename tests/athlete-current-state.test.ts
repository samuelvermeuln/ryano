/**
 * SAM-43 — estado atual do atleta: omitido sem conexão com capability de
 * saúde; dias antes do vínculo só com consentimento `metrics`; médias de 7
 * dias e série de 4 semanas por métrica presente; alerta `recovery` só com
 * sinal E treino prescrito hoje.
 */
import { describe, expect, it, vi } from "vitest";
import { GetAthleteCurrentState } from "@/modules/school/application/get-athlete-current-state";
import { recoverySignals } from "@/modules/school/application/get-coach-athlete-overview";

const NOW = new Date("2026-10-02T15:00:00.000Z");
const PERIOD_START = new Date("2026-09-25T00:00:00.000Z");

function row(date: string, values: Record<string, unknown>) {
  return {
    id: `g-${date}`, userId: "athlete", provider: "GARMIN", date, timeZone: "America/Sao_Paulo", fetchedAt: NOW,
    restingHeartRate: null, restingHeartRate7dAvg: null, energyScore: null, energyHighest: null, energyLowest: null, energyLabel: null,
    sleepScore: null, sleepDurationSeconds: null, sleepStart: null, sleepEnd: null, deepSleepSeconds: null, lightSleepSeconds: null,
    remSleepSeconds: null, awakeSeconds: null, hrvLastNight: null, hrv7dAvg: null, hrvStatus: null, readinessScore: null,
    readinessLevel: null, recoveryTimeMinutes: null, steps: null, activeKilocalories: null, totalKilocalories: null, raw: null,
    createdAt: NOW, updatedAt: NOW, ...values,
  };
}

function makeDb(rows: ReturnType<typeof row>[], connections = [{ provider: "GARMIN" }], grants: unknown[] = []) {
  return {
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach", status: "ACTIVE", userId: "user", acceptsIndependentAthletes: true, displayName: "Ricardo" }) },
    coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue({ id: "link", startedAt: PERIOD_START, coachId: "coach", coach: { displayName: "Ricardo", user: { name: "R" } } }) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "athlete", name: "Ana", email: null, image: null }) },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
    historyAccessGrant: { findMany: vi.fn().mockResolvedValue(grants) },
    wearableConnection: { findMany: vi.fn().mockResolvedValue(connections) },
    athleteDailyHealth: { findMany: vi.fn().mockResolvedValue(rows) },
  };
}

describe("GetAthleteCurrentState", () => {
  it("atleta só com Strava → seção omitida, sem consultar a tabela", async () => {
    const db = makeDb([], [{ provider: "STRAVA" }]);
    const state = await new GetAthleteCurrentState(db as never, () => NOW).execute("user", { kind: "independent" }, "athlete");
    expect(state.available).toBe(false);
    expect(db.athleteDailyHealth.findMany).not.toHaveBeenCalled();
  });

  it("hoje, média de 7 dias e série; dias antes do vínculo ficam retidos sem o consentimento `metrics`", async () => {
    const rows = [
      row("2026-09-20", { restingHeartRate: 52, sleepScore: 70 }), // antes do vínculo (25/09)
      row("2026-09-28", { restingHeartRate: 50, sleepScore: 80, energyHighest: 90, energyLabel: "Body Battery" }),
      row("2026-10-01", { restingHeartRate: 48, sleepScore: 60 }),
      row("2026-10-02", { restingHeartRate: 46, sleepScore: 85, hrvLastNight: 55, hrvStatus: "BALANCED" }),
    ];
    const state = await new GetAthleteCurrentState(makeDb(rows) as never, () => NOW).execute("user", { kind: "independent" }, "athlete");

    expect(state.available).toBe(true);
    expect(state.today).toBe("2026-10-02");
    expect(state.current?.values).toMatchObject({ restingHeartRate: 46, sleepScore: 85, hrvLastNight: 55 });
    expect(state.current?.sources.restingHeartRate).toBe("GARMIN");
    expect(state.series.map((point) => point.date)).toEqual(["2026-09-28", "2026-10-01", "2026-10-02"]);
    expect(state.withheldDays).toBe(1);
    expect(state.averages7d).toEqual({ restingHeartRate: 48, sleepScore: 75, hrvLastNight: 55, energyHighest: 90 });
    expect(state.energyLabel).toBe("Body Battery");
    expect(state.providers).toEqual(["GARMIN"]);
  });

  it("o próprio atleta lê tudo (escopo self), inclusive antes de qualquer vínculo", async () => {
    const rows = [row("2026-09-20", { restingHeartRate: 52 }), row("2026-10-02", { restingHeartRate: 46 })];
    const db = makeDb(rows);
    const state = await new GetAthleteCurrentState(db as never, () => NOW).execute("athlete", { kind: "self" }, "athlete");
    expect(state.withheldDays).toBe(0);
    expect(state.series).toHaveLength(2);
    expect(db.historyAccessGrant.findMany).not.toHaveBeenCalled();
  });
});

describe("recoverySignals", () => {
  it("sono < 60, VFC fora de balanced ou energia < 40 são sinais; valores normais ou ausentes não", () => {
    expect(recoverySignals({ sleepScore: 55, hrvStatus: "LOW", energyHighest: 30, energyLabel: "Body Battery" }))
      .toEqual(["sono 55", "VFC low", "Body Battery 30"]);
    expect(recoverySignals({ sleepScore: 80, hrvStatus: "BALANCED", energyHighest: 90 })).toEqual([]);
    expect(recoverySignals({})).toEqual([]);
  });
});
