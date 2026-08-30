/**
 * Testes de `syncAllStravaUsers` (Task 8.1) — batch por job.
 *
 * Cobre, OFFLINE e determinístico:
 *   - itera só as conexões STRAVA CONECTADAS e chama `syncStravaForUser` em modo
 *     incremental para cada uma;
 *   - ISOLAMENTO por usuário (Req 18.2): uma exceção OU um `status: "failed"` em
 *     um usuário NÃO interrompe os demais; o batch nunca lança;
 *   - agrega as contagens por desfecho (succeeded/failed/rateLimited) e a soma
 *     de atividades sincronizadas.
 *
 * ── Estratégia de isolamento ────────────────────────────────────────────────
 * - `@/server/db` é mockado: `wearableConnection.findMany` devolve as conexões
 *   semeadas (o teste controla a lista).
 * - `syncStravaForUser` é MOCKADO no módulo de origem para controlar o desfecho
 *   por usuário sem tocar client/rede/banco reais.
 *
 * _Requisitos: 18.1, 18.2, 18.4_
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Store Prisma em memória + mock hoisted ───────────────────────────────────
const dbMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  let connections: Row[] = [];

  function reset() {
    connections = [];
  }

  function seedConnections(rows: Row[]) {
    connections = rows;
  }

  const wearableConnection = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: vi.fn(async ({ where, take }: any) => {
      let rows = connections.filter(
        (c) => c.provider === where.provider && c.status === where.status,
      );
      if (typeof take === "number") rows = rows.slice(0, take);
      return rows.map((r) => ({ id: r.id, userId: r.userId }));
    }),
  };

  return { prisma: { wearableConnection }, reset, seedConnections, wearableConnection };
});

vi.mock("@/server/db", () => ({ prisma: dbMock.prisma }));

// ── Mock de syncStravaForUser (controla o desfecho por usuário) ──────────────
const syncMock = vi.hoisted(() => ({ syncStravaForUser: vi.fn() }));

vi.mock("@/modules/strava/application/sync/sync-strava", () => ({
  syncStravaForUser: syncMock.syncStravaForUser,
}));

let batch: typeof import("@/modules/strava/application/sync/sync-all-strava");

beforeAll(async () => {
  batch = await import("@/modules/strava/application/sync/sync-all-strava");
});

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

describe("syncAllStravaUsers", () => {
  it("sincroniza só conexões STRAVA CONECTADAS em modo incremental", async () => {
    dbMock.seedConnections([
      { id: "c1", userId: "u1", provider: "STRAVA", status: "CONNECTED" },
      { id: "c2", userId: "u2", provider: "STRAVA", status: "CONNECTED" },
    ]);

    syncMock.syncStravaForUser.mockResolvedValue({
      status: "synced",
      syncedCount: 3,
      createdCount: 1,
    });

    const result = await batch.syncAllStravaUsers();

    expect(result.totalConnections).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.syncedActivities).toBe(6);
    // Chamado em modo incremental para cada usuário.
    expect(syncMock.syncStravaForUser).toHaveBeenCalledTimes(2);
    expect(syncMock.syncStravaForUser).toHaveBeenCalledWith("u1", { mode: "incremental" });
    expect(syncMock.syncStravaForUser).toHaveBeenCalledWith("u2", { mode: "incremental" });
  });

  it("isola falha por usuário: um status=failed não interrompe os demais", async () => {
    dbMock.seedConnections([
      { id: "c1", userId: "u1", provider: "STRAVA", status: "CONNECTED" },
      { id: "c2", userId: "u2", provider: "STRAVA", status: "CONNECTED" },
      { id: "c3", userId: "u3", provider: "STRAVA", status: "CONNECTED" },
    ]);

    syncMock.syncStravaForUser
      .mockResolvedValueOnce({ status: "synced", syncedCount: 2, createdCount: 2 })
      .mockResolvedValueOnce({ status: "failed", syncedCount: 0, createdCount: 0, errorCode: "BOOM" })
      .mockResolvedValueOnce({ status: "synced", syncedCount: 1, createdCount: 0 });

    const result = await batch.syncAllStravaUsers();

    expect(result.totalConnections).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.syncedActivities).toBe(3);
    // Todos os três foram tentados (o do meio falhou, mas o loop seguiu).
    expect(syncMock.syncStravaForUser).toHaveBeenCalledTimes(3);
  });

  it("isola exceção inesperada: um throw não derruba o batch", async () => {
    dbMock.seedConnections([
      { id: "c1", userId: "u1", provider: "STRAVA", status: "CONNECTED" },
      { id: "c2", userId: "u2", provider: "STRAVA", status: "CONNECTED" },
    ]);

    syncMock.syncStravaForUser
      .mockRejectedValueOnce(new Error("unexpected"))
      .mockResolvedValueOnce({ status: "synced", syncedCount: 5, createdCount: 5 });

    const result = await batch.syncAllStravaUsers();

    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.syncedActivities).toBe(5);
    // O primeiro usuário registrou falha com status "failed".
    const u1 = result.results.find((r) => r.userId === "u1");
    expect(u1?.status).toBe("failed");
  });

  it("contabiliza usuários pausados por rate limit", async () => {
    dbMock.seedConnections([
      { id: "c1", userId: "u1", provider: "STRAVA", status: "CONNECTED" },
    ]);

    syncMock.syncStravaForUser.mockResolvedValue({
      status: "rate-limited",
      syncedCount: 1,
      createdCount: 0,
      retryAfterMs: 5000,
    });

    const result = await batch.syncAllStravaUsers();

    expect(result.rateLimited).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.syncedActivities).toBe(1);
  });

  it("sem conexões conectadas → resumo zerado, sem throw", async () => {
    dbMock.seedConnections([
      { id: "c1", userId: "u1", provider: "STRAVA", status: "DISCONNECTED" },
      { id: "c2", userId: "u2", provider: "GARMIN", status: "CONNECTED" },
    ]);

    const result = await batch.syncAllStravaUsers();

    expect(result.totalConnections).toBe(0);
    expect(syncMock.syncStravaForUser).not.toHaveBeenCalled();
  });
});
