/**
 * Testes DIRETOS dos purges do Strava acionados por evento (Task 8.4).
 *
 * Complementa `cleanup-retention.test.ts` (TTL) e `webhook-processor.test.ts`
 * (que exercita os purges via `processStravaWebhookEvent`), cobrindo aqui, em
 * nível de UNIDADE e OFFLINE, as duas funções de purge chamadas diretamente:
 *
 *   - `purgeDeletedActivityData({ externalId, userId, connectionId })`
 *       → remove a `Activity` (provider=STRAVA, externalId, userId) e a linha
 *         de `StravaActivityCache` correspondente; idempotente; NÃO toca
 *         atividades de outro provider nem de outro usuário.
 *
 *   - `purgeDeauthorizedUserData({ userId, connectionId })`
 *       → remove WearableSecret + StravaConnectionDetails + StravaActivityCache
 *         da conexão E as `Activity` STRAVA do usuário; marca a
 *         `WearableConnection` como DISCONNECTED (externalAccountId zerado);
 *         NÃO toca linhas de outros providers do mesmo usuário; idempotente.
 *
 * ── Estratégia de isolamento ────────────────────────────────────────────────
 * `@/server/db` é mockado com um store Prisma em memória que suporta as duas
 * formas de `$transaction` usadas pelas funções:
 *   - forma ARRAY  → `purgeDeletedActivityData` (`$transaction([...])`);
 *   - forma CALLBACK → `purgeDeauthorizedUserData` (`$transaction(async tx =>)`).
 *
 * _Requisitos: 12.4, 12.5, 12.6, 17.3, 17.4, 3.6, 21.2_
 */

import { WearableProvider } from "@prisma/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Store Prisma em memória + mock hoisted ───────────────────────────────────
const dbMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const activities: Row[] = []; // { id, provider, externalId, userId }
  const cache: Row[] = []; // { id, wearableConnectionId, stravaActivityId }
  const secrets: Row[] = []; // { id, wearableConnectionId }
  const details: Row[] = []; // { id, wearableConnectionId }
  const connections: Row[] = []; // { id, status, externalAccountId, ... }

  function reset() {
    activities.length = 0;
    cache.length = 0;
    secrets.length = 0;
    details.length = 0;
    connections.length = 0;
  }

  /** Remove de `rows` todos os itens que casam com TODAS as chaves de `where`. */
  function removeMatching(rows: Row[], where: Row): number {
    let count = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const matches = Object.entries(where).every(
        ([key, value]) => rows[i][key] === value,
      );
      if (matches) {
        rows.splice(i, 1);
        count += 1;
      }
    }
    return count;
  }

  const activity = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn(async ({ where }: any) => ({
      count: removeMatching(activities, where),
    })),
  };

  const stravaActivityCache = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn(async ({ where }: any) => ({
      count: removeMatching(cache, where),
    })),
  };

  const wearableSecret = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn(async ({ where }: any) => ({
      count: removeMatching(secrets, where),
    })),
  };

  const stravaConnectionDetails = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn(async ({ where }: any) => ({
      count: removeMatching(details, where),
    })),
  };

  const wearableConnection = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: vi.fn(async ({ where, data }: any) => {
      const row = connections.find((c) => c.id === where.id);
      if (!row) {
        throw new Error("CONNECTION_NOT_FOUND");
      }
      Object.assign(row, data);
      return { ...row };
    }),
  };

  const prisma: Row = {
    activity,
    stravaActivityCache,
    wearableSecret,
    stravaConnectionDetails,
    wearableConnection,
    // Suporta AMBAS as formas de $transaction:
    //  - array de promises (purgeDeletedActivityData);
    //  - callback recebendo o client (purgeDeauthorizedUserData).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn(async (arg: any) => {
      if (typeof arg === "function") {
        return arg(prisma);
      }
      return Promise.all(arg);
    }),
  };

  return {
    prisma,
    reset,
    seed: {
      activity(row: Row) {
        activities.push(row);
      },
      cache(row: Row) {
        cache.push(row);
      },
      secret(row: Row) {
        secrets.push(row);
      },
      details(row: Row) {
        details.push(row);
      },
      connection(row: Row) {
        connections.push(row);
      },
    },
    stores: { activities, cache, secrets, details, connections },
  };
});

vi.mock("@/server/db", () => ({ prisma: dbMock.prisma }));

let cleanup: typeof import("@/modules/strava/application/cleanup");

beforeAll(async () => {
  cleanup = await import("@/modules/strava/application/cleanup");
});

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// purgeDeletedActivityData — evento activity/delete (Req 12.4, 17.4)
// ---------------------------------------------------------------------------
describe("purgeDeletedActivityData", () => {
  it("remove a Activity STRAVA e o cache correspondente", async () => {
    dbMock.seed.activity({
      id: "act-1",
      provider: WearableProvider.STRAVA,
      externalId: "999",
      userId: "user-1",
    });
    dbMock.seed.cache({
      id: "cache-1",
      wearableConnectionId: "conn-1",
      stravaActivityId: "999",
    });

    const result = await cleanup.purgeDeletedActivityData({
      externalId: "999",
      userId: "user-1",
      connectionId: "conn-1",
    });

    expect(result.deletedActivities).toBe(1);
    expect(result.deletedCacheEntries).toBe(1);
    expect(dbMock.stores.activities).toHaveLength(0);
    expect(dbMock.stores.cache).toHaveLength(0);
  });

  it("é idempotente: reprocessar quando já não existe é no-op (0/0)", async () => {
    // Nada semeado → primeira chamada já é no-op.
    const first = await cleanup.purgeDeletedActivityData({
      externalId: "999",
      userId: "user-1",
      connectionId: "conn-1",
    });
    const second = await cleanup.purgeDeletedActivityData({
      externalId: "999",
      userId: "user-1",
      connectionId: "conn-1",
    });

    expect(first).toEqual({ deletedActivities: 0, deletedCacheEntries: 0 });
    expect(second).toEqual({ deletedActivities: 0, deletedCacheEntries: 0 });
  });

  it("NÃO remove atividade de outro provider com o mesmo externalId (Req 3.6)", async () => {
    dbMock.seed.activity({
      id: "garmin-1",
      provider: WearableProvider.GARMIN,
      externalId: "999", // mesmo externalId, provider diferente
      userId: "user-1",
    });

    const result = await cleanup.purgeDeletedActivityData({
      externalId: "999",
      userId: "user-1",
      connectionId: "conn-1",
    });

    expect(result.deletedActivities).toBe(0);
    expect(dbMock.stores.activities).toHaveLength(1);
    expect(dbMock.stores.activities[0].id).toBe("garmin-1");
  });

  it("NÃO remove a mesma atividade STRAVA de OUTRO usuário", async () => {
    dbMock.seed.activity({
      id: "other-user",
      provider: WearableProvider.STRAVA,
      externalId: "999",
      userId: "user-2", // usuário diferente
    });

    const result = await cleanup.purgeDeletedActivityData({
      externalId: "999",
      userId: "user-1",
      connectionId: "conn-1",
    });

    expect(result.deletedActivities).toBe(0);
    expect(dbMock.stores.activities).toHaveLength(1);
    expect(dbMock.stores.activities[0].id).toBe("other-user");
  });
});

// ---------------------------------------------------------------------------
// purgeDeauthorizedUserData — desautorização athlete (Req 17.3, 3.6)
// ---------------------------------------------------------------------------
describe("purgeDeauthorizedUserData", () => {
  function seedFullStravaFootprint() {
    dbMock.seed.secret({ id: "sec-1", wearableConnectionId: "conn-1" });
    dbMock.seed.details({ id: "det-1", wearableConnectionId: "conn-1" });
    dbMock.seed.cache({
      id: "cache-1",
      wearableConnectionId: "conn-1",
      stravaActivityId: "999",
    });
    dbMock.seed.activity({
      id: "strava-act",
      provider: WearableProvider.STRAVA,
      externalId: "999",
      userId: "user-1",
    });
    dbMock.seed.connection({
      id: "conn-1",
      status: "CONNECTED",
      lastSyncStatus: "SYNCED",
      lastErrorCode: "SOME_ERROR",
      externalAccountId: "athlete-42",
      lastEventAt: null,
    });
  }

  it("remove secrets/detalhes/cache + Activity STRAVA e marca conexão DISCONNECTED", async () => {
    seedFullStravaFootprint();

    const result = await cleanup.purgeDeauthorizedUserData({
      userId: "user-1",
      connectionId: "conn-1",
    });

    expect(result).toEqual({
      deletedSecrets: 1,
      deletedConnectionDetails: 1,
      deletedCacheEntries: 1,
      deletedActivities: 1,
    });

    expect(dbMock.stores.secrets).toHaveLength(0);
    expect(dbMock.stores.details).toHaveLength(0);
    expect(dbMock.stores.cache).toHaveLength(0);
    expect(dbMock.stores.activities).toHaveLength(0);

    const conn = dbMock.stores.connections[0];
    expect(conn.status).toBe("DISCONNECTED");
    expect(conn.lastSyncStatus).toBe("DISCONNECTED");
    expect(conn.lastErrorCode).toBeNull();
    expect(conn.externalAccountId).toBeNull();
    expect(conn.lastEventAt).toBeInstanceOf(Date);
  });

  it("NÃO toca linhas de outro provider do mesmo usuário (Req 3.6)", async () => {
    seedFullStravaFootprint();
    // Pegada GARMIN do MESMO usuário: atividade + conexão devem sobreviver.
    dbMock.seed.activity({
      id: "garmin-act",
      provider: WearableProvider.GARMIN,
      externalId: "777",
      userId: "user-1",
    });
    dbMock.seed.connection({
      id: "conn-garmin",
      status: "CONNECTED",
      externalAccountId: "garmin-account",
    });

    await cleanup.purgeDeauthorizedUserData({
      userId: "user-1",
      connectionId: "conn-1",
    });

    // A atividade GARMIN permanece.
    const garminAct = dbMock.stores.activities.find((a) => a.id === "garmin-act");
    expect(garminAct).toBeDefined();
    expect(dbMock.stores.activities).toHaveLength(1);

    // A conexão GARMIN não foi alterada.
    const garminConn = dbMock.stores.connections.find(
      (c) => c.id === "conn-garmin",
    );
    expect(garminConn?.status).toBe("CONNECTED");
    expect(garminConn?.externalAccountId).toBe("garmin-account");
  });

  it("é idempotente: segunda chamada é no-op nas contagens de delete", async () => {
    seedFullStravaFootprint();

    const first = await cleanup.purgeDeauthorizedUserData({
      userId: "user-1",
      connectionId: "conn-1",
    });
    const second = await cleanup.purgeDeauthorizedUserData({
      userId: "user-1",
      connectionId: "conn-1",
    });

    expect(first.deletedSecrets).toBe(1);
    expect(second).toEqual({
      deletedSecrets: 0,
      deletedConnectionDetails: 0,
      deletedCacheEntries: 0,
      deletedActivities: 0,
    });
    // A conexão continua DISCONNECTED após o reprocessamento.
    expect(dbMock.stores.connections[0].status).toBe("DISCONNECTED");
  });
});
