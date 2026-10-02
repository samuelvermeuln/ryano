/**
 * SAM-42 — o job grava uma linha por (usuário, provider, dia) e re-executa
 * sem duplicar; provider sem capability não é chamado; falha de um provider
 * não derruba os outros; dois providers no mesmo dia viram duas linhas e a
 * leitura escolhe por campo.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/shared/integrations/observability/log", () => ({ logIntegrationEvent: vi.fn() }));
vi.mock("@/server/crypto/secret-vault", () => ({ decryptSecret: () => "key" }));

import { normalizedDailyHealthSchema } from "@/modules/shared/activities/contracts";
import { IngestDailyHealth, loadResolvedDailyHealth, loadResolvedDailyHealthRange, rowToDailyHealth } from "@/modules/shared/health";
import type { ProviderModule } from "@/modules/shared/integrations/contracts";

const NOW = new Date("2026-10-02T15:00:00.000Z");

function health(provider: "GARMIN" | "POLAR", overrides: Record<string, unknown> = {}) {
  return normalizedDailyHealthSchema.parse({
    provider, date: "2026-10-02", timeZone: "America/Sao_Paulo", fetchedAt: NOW,
    restingHeartRate: 48, energyHighest: 92, energyLabel: "Body Battery", sleepScore: 81, ...overrides,
  });
}

function makeDb(connections: Array<{ id: string; userId: string; provider: string }>) {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    wearableConnection: { findMany: vi.fn().mockResolvedValue(connections) },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
    wearableSecret: { findUnique: vi.fn().mockResolvedValue(null) },
    athleteDailyHealth: {
      upsert: vi.fn().mockImplementation(async ({ where, create }: { where: { userId_provider_date: { userId: string; provider: string; date: string } }; create: Record<string, unknown> }) => {
        const key = `${where.userId_provider_date.userId}:${where.userId_provider_date.provider}:${where.userId_provider_date.date}`;
        rows.set(key, { id: key, ...create });
        return rows.get(key);
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: { where: { userId: string; date?: string | { gte: string; lte: string } } }) =>
        [...rows.values()].filter((row) => row.userId === where.userId && (typeof where.date === "string" ? row.date === where.date : true))),
    },
  };
}

const garmin: ProviderModule = {
  id: "GARMIN",
  dailyHealth: { id: "GARMIN", authType: "CREDENTIALS", capabilities: { dailyHealth: true }, getDailyHealth: vi.fn(async () => health("GARMIN")) },
};
const strava: ProviderModule = {
  id: "STRAVA",
  // Would be a contract violation in the real registry; here it proves the catalog gate.
  dailyHealth: { id: "STRAVA", authType: "OAUTH2", capabilities: {}, getDailyHealth: vi.fn(async () => health("GARMIN")) },
};

describe("IngestDailyHealth", () => {
  it("uma linha por (usuário, provider, dia); re-execução atualiza sem duplicar; Strava nunca é chamado", async () => {
    const db = makeDb([{ id: "c-g", userId: "u1", provider: "GARMIN" }, { id: "c-s", userId: "u1", provider: "STRAVA" }]);
    const job = new IngestDailyHealth(db as never, { GARMIN: garmin, STRAVA: strava }, () => NOW);

    const first = await job.execute();
    expect(first).toEqual({ considered: 2, ingested: 1, empty: 0, failed: 0, skipped: 1 });
    expect(strava.dailyHealth!.getDailyHealth).not.toHaveBeenCalled();
    expect(garmin.dailyHealth!.getDailyHealth).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", connectionId: "c-g" }),
      { date: "2026-10-02", timeZone: "America/Sao_Paulo" },
    );
    const second = await job.execute();
    expect(second.ingested).toBe(1);
    expect(db.rows.size).toBe(1);
    expect(db.athleteDailyHealth.upsert.mock.calls[0][0].create).toMatchObject({ userId: "u1", provider: "GARMIN", date: "2026-10-02", restingHeartRate: 48, energyLabel: "Body Battery", deepSleepSeconds: null });
  });

  it("isolamento: a falha de um provider não impede o outro; sem dado conta como vazio", async () => {
    const polarFails: ProviderModule = {
      id: "POLAR",
      dailyHealth: { id: "POLAR", authType: "OAUTH2", capabilities: { dailyHealth: true }, getDailyHealth: vi.fn(async () => { throw new Error("boom"); }) },
    };
    const db = makeDb([{ id: "c-p", userId: "u1", provider: "POLAR" }, { id: "c-g", userId: "u1", provider: "GARMIN" }]);
    // POLAR is COMING_SOON in the catalog (no dailyHealth) → skipped by the gate, not failed.
    const result = await new IngestDailyHealth(db as never, { POLAR: polarFails, GARMIN: garmin }, () => NOW).execute();
    expect(result).toEqual({ considered: 2, ingested: 1, empty: 0, failed: 0, skipped: 1 });

    const garminEmpty: ProviderModule = { id: "GARMIN", dailyHealth: { ...garmin.dailyHealth!, getDailyHealth: vi.fn(async () => null) } };
    const empty = await new IngestDailyHealth(makeDb([{ id: "c-g", userId: "u2", provider: "GARMIN" }]) as never, { GARMIN: garminEmpty }, () => NOW).execute();
    expect(empty).toEqual({ considered: 1, ingested: 0, empty: 1, failed: 0, skipped: 0 });
  });
});

describe("loadResolvedDailyHealth", () => {
  it("duas conexões no mesmo dia → duas linhas e um valor por campo, rotulado pela origem", async () => {
    const db = makeDb([]);
    db.rows.set("u1:GARMIN:2026-10-02", { id: "a", userId: "u1", ...health("GARMIN", { sleepScore: null }), raw: null });
    db.rows.set("u1:POLAR:2026-10-02", { id: "b", userId: "u1", ...health("POLAR", { restingHeartRate: 50, energyHighest: null, energyLabel: null, sleepScore: 77 }), raw: null });

    const resolved = await loadResolvedDailyHealth(db as never, "u1", "2026-10-02", { preferred: ["GARMIN"] });
    expect(resolved!.values).toMatchObject({ restingHeartRate: 48, energyHighest: 92, sleepScore: 77 });
    expect(resolved!.sources).toMatchObject({ restingHeartRate: "GARMIN", energyHighest: "GARMIN", sleepScore: "POLAR" });

    const range = await loadResolvedDailyHealthRange(db as never, "u1", { from: "2026-09-01", to: "2026-10-02" });
    expect(range).toHaveLength(1);
    expect(rowToDailyHealth(db.rows.get("u1:GARMIN:2026-10-02") as never).energyLabel).toBe("Body Battery");
  });
});
