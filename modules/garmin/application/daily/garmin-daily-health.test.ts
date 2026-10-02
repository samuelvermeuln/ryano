/**
 * SAM-42 — snapshot Garmin → NormalizedDailyHealth: Body Battery rotulado,
 * ausência ≠ zero, provider sem dado devolve null.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ prisma: {} }));

import { createGarminDailyHealthProvider, mapGarminSnapshotToDailyHealth } from "@/modules/garmin/application/daily/garmin-daily-health";
import type { GarminDailySnapshot } from "@/modules/garmin/application/daily/garmin-daily-report";

const SNAPSHOT: GarminDailySnapshot = {
  date: "2026-10-02", fetchedAt: new Date("2026-10-02T09:00:00.000Z"), cached: false,
  summary: { steps: 8420, distanceMeters: 6100, totalKilocalories: 2310, activeKilocalories: 640, restingHeartRate: 48, bodyBatteryHighest: 92, bodyBatteryLowest: 31 },
  sleep: { durationSeconds: 25_200, score: 81, avgSleepHrv: 54 },
  hrv: { lastNightAvg: 56.4, weeklyAvg: 52.1, status: "BALANCED" },
  readiness: { score: 74, level: "HIGH", recoveryTimeMinutes: 420, feedback: "Pronto para treinar" },
  warnings: [],
};

describe("mapGarminSnapshotToDailyHealth", () => {
  it("mapeia campo a campo com a energia proprietária rotulada 'Body Battery'", () => {
    const health = mapGarminSnapshotToDailyHealth(SNAPSHOT, { date: "2026-10-02", timeZone: "America/Sao_Paulo" });
    expect(health).toMatchObject({
      provider: "GARMIN", date: "2026-10-02", timeZone: "America/Sao_Paulo",
      restingHeartRate: 48, energyHighest: 92, energyLowest: 31, energyLabel: "Body Battery", energyScore: null,
      sleepScore: 81, sleepDurationSeconds: 25_200, hrvLastNight: 56.4, hrv7dAvg: 52.1, hrvStatus: "BALANCED",
      readinessScore: 74, readinessLevel: "HIGH", recoveryTimeMinutes: 420, steps: 8420, activeKilocalories: 640, totalKilocalories: 2310,
    });
    expect(health.raw).toMatchObject({ distanceMeters: 6100, readinessFeedback: "Pronto para treinar" });
    expect(health.deepSleepSeconds).toBeNull(); // o snapshot não traz fases
  });

  it("sem Body Battery não inventa rótulo nem zero", () => {
    const health = mapGarminSnapshotToDailyHealth({ ...SNAPSHOT, summary: { ...SNAPSHOT.summary, bodyBatteryHighest: null, bodyBatteryLowest: null } }, { date: "2026-10-02", timeZone: "UTC" });
    expect(health.energyLabel).toBeNull();
    expect(health.energyHighest).toBeNull();
  });
});

describe("createGarminDailyHealthProvider", () => {
  it("lê o snapshot do usuário da conexão e devolve o DTO; sem dado → null", async () => {
    const load = vi.fn().mockResolvedValueOnce(SNAPSHOT).mockResolvedValueOnce(null);
    const provider = createGarminDailyHealthProvider(load);
    const ctx = { userId: "u1", connectionId: "c1", secrets: { getSecret: async () => null } };
    const health = await provider.getDailyHealth(ctx, { date: "2026-10-02", timeZone: "America/Sao_Paulo" });
    expect(health?.restingHeartRate).toBe(48);
    expect(load).toHaveBeenCalledWith("u1", { date: "2026-10-02" });
    expect(await provider.getDailyHealth(ctx, { date: "2026-10-01", timeZone: "America/Sao_Paulo" })).toBeNull();
    expect(provider.capabilities.dailyHealth).toBe(true);
  });
});
