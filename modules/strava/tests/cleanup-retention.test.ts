/**
 * Testes de retenção/cleanup por TTL do Strava (Task 8).
 *
 * Cobre, OFFLINE e determinístico:
 *   - `purgeExpiredActivityCache`: remove só as entradas com `expiresAt < now`.
 *   - `purgeExpiredWebhookPayloads`: remove só os eventos com `expiresAt < now`.
 *   - `purgeExpiredStreams`: no-op documentado → sempre 0, sem tocar o banco.
 *   - `runStravaRetentionCleanup`: agrega as contagens e ISOLA falhas entre os
 *     passos (Req 18.2) — se um purge lança, os demais ainda rodam e o agregador
 *     não propaga a exceção.
 *
 * ── Estratégia de isolamento ────────────────────────────────────────────────
 * `@/server/db` é mockado com um store em memória para `stravaActivityCache` e
 * `stravaWebhookEvent`, aplicando o filtro `expiresAt < now` no `deleteMany`.
 *
 * _Requisitos: 17.1, 17.2, 17.5, 18.2_
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Store Prisma em memória + mock hoisted ───────────────────────────────────
const dbMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const cache: Row[] = []; // { id, expiresAt }
  const webhookEvents: Row[] = []; // { id, expiresAt }

  // Flags para simular falhas por tabela (isolamento no agregador).
  const failFlags = { cache: false, webhook: false };

  function reset() {
    cache.length = 0;
    webhookEvents.length = 0;
    failFlags.cache = false;
    failFlags.webhook = false;
  }

  function seedCache(id: string, expiresAt: Date) {
    cache.push({ id, expiresAt });
  }

  function seedWebhookEvent(id: string, expiresAt: Date) {
    webhookEvents.push({ id, expiresAt });
  }

  /** Remove de `rows` os itens com `expiresAt < where.expiresAt.lt`. */
  function deleteExpired(rows: Row[], lt: Date): number {
    let count = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if ((rows[i].expiresAt as Date).getTime() < lt.getTime()) {
        rows.splice(i, 1);
        count += 1;
      }
    }
    return count;
  }

  const stravaActivityCache = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn(async ({ where }: any) => {
      if (failFlags.cache) throw new Error("CACHE_DELETE_FAILED");
      return { count: deleteExpired(cache, where.expiresAt.lt) };
    }),
  };

  const stravaWebhookEvent = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn(async ({ where }: any) => {
      if (failFlags.webhook) throw new Error("WEBHOOK_DELETE_FAILED");
      return { count: deleteExpired(webhookEvents, where.expiresAt.lt) };
    }),
  };

  const prisma: Row = { stravaActivityCache, stravaWebhookEvent };

  return {
    prisma,
    reset,
    seedCache,
    seedWebhookEvent,
    failFlags,
    mocks: {
      cacheDeleteMany: stravaActivityCache.deleteMany,
      webhookDeleteMany: stravaWebhookEvent.deleteMany,
    },
    stores: { cache, webhookEvents },
  };
});

vi.mock("@/server/db", () => ({ prisma: dbMock.prisma }));

let cleanup: typeof import("@/modules/strava/application/cleanup");

beforeAll(async () => {
  cleanup = await import("@/modules/strava/application/cleanup");
});

const NOW = new Date(Date.UTC(2024, 5, 1, 12, 0, 0));
const PAST = new Date(NOW.getTime() - 60_000); // 1 min no passado (expirado)
const FUTURE = new Date(NOW.getTime() + 60_000); // 1 min no futuro (vigente)

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// purgeExpiredActivityCache
// ---------------------------------------------------------------------------
describe("purgeExpiredActivityCache", () => {
  it("remove só as entradas expiradas (expiresAt < now)", async () => {
    dbMock.seedCache("expired-1", PAST);
    dbMock.seedCache("expired-2", PAST);
    dbMock.seedCache("valid-1", FUTURE);

    const result = await cleanup.purgeExpiredActivityCache({ now: () => NOW });

    expect(result.deletedCacheEntries).toBe(2);
    // Só a entrada vigente permanece.
    expect(dbMock.stores.cache).toHaveLength(1);
    expect(dbMock.stores.cache[0].id).toBe("valid-1");
  });

  it("nada expirado → 0, idempotente", async () => {
    dbMock.seedCache("valid-1", FUTURE);
    const first = await cleanup.purgeExpiredActivityCache({ now: () => NOW });
    const second = await cleanup.purgeExpiredActivityCache({ now: () => NOW });
    expect(first.deletedCacheEntries).toBe(0);
    expect(second.deletedCacheEntries).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// purgeExpiredWebhookPayloads
// ---------------------------------------------------------------------------
describe("purgeExpiredWebhookPayloads", () => {
  it("remove só os eventos expirados (expiresAt < now)", async () => {
    dbMock.seedWebhookEvent("evt-old", PAST);
    dbMock.seedWebhookEvent("evt-new", FUTURE);

    const result = await cleanup.purgeExpiredWebhookPayloads({ now: () => NOW });

    expect(result.deletedWebhookEvents).toBe(1);
    expect(dbMock.stores.webhookEvents).toHaveLength(1);
    expect(dbMock.stores.webhookEvents[0].id).toBe("evt-new");
  });
});

// ---------------------------------------------------------------------------
// purgeExpiredStreams — no-op documentado
// ---------------------------------------------------------------------------
describe("purgeExpiredStreams", () => {
  it("é um no-op: retorna 0 e não toca o banco", async () => {
    const result = await cleanup.purgeExpiredStreams({ now: () => NOW });
    expect(result.deletedStreamEntries).toBe(0);
    // Nenhuma tabela de cache foi acessada.
    expect(dbMock.mocks.cacheDeleteMany).not.toHaveBeenCalled();
    expect(dbMock.mocks.webhookDeleteMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runStravaRetentionCleanup — agregação + isolamento de falhas
// ---------------------------------------------------------------------------
describe("runStravaRetentionCleanup", () => {
  it("agrega as contagens de todos os purges", async () => {
    dbMock.seedCache("c1", PAST);
    dbMock.seedCache("c2", PAST);
    dbMock.seedWebhookEvent("w1", PAST);
    dbMock.seedWebhookEvent("valid", FUTURE);

    const result = await cleanup.runStravaRetentionCleanup({ now: () => NOW });

    expect(result.deletedCacheEntries).toBe(2);
    expect(result.deletedStreamEntries).toBe(0);
    expect(result.deletedWebhookEvents).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("isola falhas: cache falha, mas webhook cleanup ainda roda (Req 18.2)", async () => {
    dbMock.seedWebhookEvent("w1", PAST);
    dbMock.failFlags.cache = true; // faz o purge de cache lançar

    const result = await cleanup.runStravaRetentionCleanup({ now: () => NOW });

    // O passo de cache falhou (registrado em errors), mas NÃO abortou o resto.
    expect(result.errors).toContain("purgeExpiredActivityCache");
    // O purge de webhooks ainda rodou e removeu o evento expirado.
    expect(result.deletedWebhookEvents).toBe(1);
    expect(dbMock.stores.webhookEvents).toHaveLength(0);
  });

  it("nunca lança, mesmo com múltiplas falhas", async () => {
    dbMock.failFlags.cache = true;
    dbMock.failFlags.webhook = true;

    const result = await cleanup.runStravaRetentionCleanup({ now: () => NOW });

    expect(result.errors).toContain("purgeExpiredActivityCache");
    expect(result.errors).toContain("purgeExpiredWebhookPayloads");
    // Streams (no-op) não falha.
    expect(result.deletedStreamEntries).toBe(0);
  });
});
