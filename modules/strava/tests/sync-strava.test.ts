/**
 * Testes de `syncStravaForUser` (Task 6.5) — camada `application/sync`.
 *
 * Cobre, OFFLINE e determinístico, os cenários de sincronização/backfill:
 * - backfill: paginação até página vazia + upsert de todas as atividades; a
 *   janela `after` ≈ `now - backfillDays`; a Policy Gate (`assertPolicy`) é
 *   exercitada (STRAVA/persist passa).
 * - idempotência: 1ª execução cria; 2ª execução (mesmas atividades) atualiza
 *   (`createdCount === 0`).
 * - no-connection: usuário sem conexão STRAVA → status "no-connection", sem throw.
 * - rate-limited: client injetado lança `StravaRateLimitExceededError` → sync
 *   retorna "rate-limited" com `retryAfterMs`, persiste o parcial, sem crash.
 *
 * ── Estratégia de isolamento ────────────────────────────────────────────────
 * - O `StravaClient` é INJETADO (`input.client`) — um fake com
 *   `listAthleteActivities` mockado — evitando qualquer rede real.
 * - `@/server/db` é mockado com um store em memória (wearableConnection.findUnique/
 *   update, activity.findUnique/upsert), dando idempotência natural (findUnique
 *   retorna null na 1ª vez e a linha na 2ª).
 * - `now` é injetado para tornar a janela `after` determinística.
 * - `resetStravaRateLimiter()` roda em `beforeEach`.
 *
 * ── Env-at-import (mesma abordagem da Task 5.6) ──────────────────────────────
 * Variáveis definidas em statements top-level ANTES do import dinâmico dos
 * módulos sob teste em `beforeAll`.
 *
 * _Requisitos: 21.2, 21.4_
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSummaryActivity,
  buildSummaryRun,
} from "@/modules/strava/tests/fixtures/strava-activities";

// ── Store Prisma em memória + mock hoisted ───────────────────────────────────
const dbMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const connectionsByUser = new Map<string, Row>();
  const activities = new Map<string, Row>();

  function reset() {
    connectionsByUser.clear();
    activities.clear();
  }

  /** Registra uma conexão STRAVA para um usuário (helper de teste). */
  function seedConnection(userId: string, row: Row) {
    connectionsByUser.set(userId, { userId, ...row });
  }

  const activityKey = (externalId: string, userId: string) => `${externalId}:${userId}`;

  const wearableConnection = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: vi.fn(async ({ where }: any) => {
      if (where.userId_provider) {
        const row = connectionsByUser.get(where.userId_provider.userId);
        return row ? { ...row } : null;
      }
      return null;
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: vi.fn(async ({ where, data }: any) => {
      // Localiza a conexão por id e mescla os dados.
      for (const [userId, row] of connectionsByUser) {
        if (row.id === where.id) {
          const merged = { ...row, ...data };
          connectionsByUser.set(userId, merged);
          return { ...merged };
        }
      }
      return { id: where.id, ...data };
    }),
  };

  const activity = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: vi.fn(async ({ where }: any) => {
      const { externalId, userId } = where.provider_externalId_userId;
      const row = activities.get(activityKey(externalId, userId));
      return row ? { ...row } : null;
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const { externalId, userId } = where.provider_externalId_userId;
      const key = activityKey(externalId, userId);
      if (activities.has(key)) {
        const merged = { ...activities.get(key), ...update };
        activities.set(key, merged);
        return { ...merged };
      }
      const row = { ...create };
      activities.set(key, row);
      return { ...row };
    }),
  };

  const prisma = { wearableConnection, activity };

  return { prisma, reset, seedConnection, stores: { connectionsByUser, activities } };
});

vi.mock("@/server/db", () => ({ prisma: dbMock.prisma }));

// ── Env-at-import: definido ANTES dos imports dinâmicos ──────────────────────
process.env.AUTH_SECRET = "test-auth-secret-for-strava-sync";
process.env.DATA_ENCRYPTION_KEY = "test-data-encryption-key";
process.env.STRAVA_CLIENT_ID = "test-strava-client-id";
process.env.STRAVA_CLIENT_SECRET = "test-strava-client-secret";

// ── Módulos sob teste, carregados após o env estar setado ────────────────────
let syncModule: typeof import("@/modules/strava/application/sync/sync-strava");
let clientModule: typeof import("@/modules/strava/api/client/strava-client");
let rateLimit: typeof import("@/modules/strava/infrastructure/rate-limit");

beforeAll(async () => {
  syncModule = await import("@/modules/strava/application/sync/sync-strava");
  clientModule = await import("@/modules/strava/api/client/strava-client");
  rateLimit = await import("@/modules/strava/infrastructure/rate-limit");
});

// ── Helper: fake StravaClient com listAthleteActivities controlável ──────────
type ListImpl = (
  ctx: unknown,
  params: { after?: number; page?: number; perPage?: number },
) => Promise<unknown[]>;

function fakeClient(listImpl: ListImpl) {
  const listAthleteActivities = vi.fn(listImpl);
  return {
    client: { listAthleteActivities } as unknown as import("@/modules/strava/api/client/strava-client").StravaClient,
    listAthleteActivities,
  };
}

const FIXED_NOW_MS = Date.UTC(2024, 5, 1, 12, 0, 0);
const SECONDS_PER_DAY = 24 * 60 * 60;

beforeEach(() => {
  dbMock.reset();
  rateLimit.resetStravaRateLimiter();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// no-connection
// ---------------------------------------------------------------------------
describe("syncStravaForUser — sem conexão", () => {
  it("usuário sem conexão STRAVA → status no-connection, sem throw", async () => {
    const { client, listAthleteActivities } = fakeClient(async () => []);

    const result = await syncModule.syncStravaForUser("user_without_strava", { client });

    expect(result.status).toBe("no-connection");
    expect(result.syncedCount).toBe(0);
    expect(result.createdCount).toBe(0);
    expect(listAthleteActivities).not.toHaveBeenCalled();
  });

  it("userId vazio → status no-connection", async () => {
    const { client } = fakeClient(async () => []);
    const result = await syncModule.syncStravaForUser("", { client });
    expect(result.status).toBe("no-connection");
  });
});

// ---------------------------------------------------------------------------
// backfill + paginação
// ---------------------------------------------------------------------------
describe("syncStravaForUser — backfill", () => {
  beforeEach(() => {
    dbMock.seedConnection("user_1", {
      id: "conn_1",
      status: "CONNECTED",
      lastSyncAt: null,
      lastSuccessAt: null,
    });
  });

  it("pagina até a página vazia e faz upsert de todas as atividades", async () => {
    const { client, listAthleteActivities } = fakeClient(async (_ctx, params) => {
      // Página 1 cheia (== perPage) força a busca da página 2.
      if (params.page === 1) {
        return [buildSummaryActivity(), buildSummaryRun()];
      }
      return []; // página vazia → fim da paginação
    });

    const result = await syncModule.syncStravaForUser("user_1", {
      client,
      mode: "initial-backfill",
      now: () => FIXED_NOW_MS,
      backfillDays: 30,
      perPage: 2,
    });

    expect(result.status).toBe("synced");
    expect(result.mode).toBe("initial-backfill");
    expect(result.syncedCount).toBe(2);
    expect(result.createdCount).toBe(2);
    // Paginou: página 1 (cheia) + página 2 (vazia).
    expect(listAthleteActivities).toHaveBeenCalledTimes(2);
    // Persistiu ambas as atividades.
    expect(dbMock.stores.activities.size).toBe(2);
  });

  it("usa a janela after ≈ now - backfillDays (epoch em segundos)", async () => {
    const { client, listAthleteActivities } = fakeClient(async () => []);

    await syncModule.syncStravaForUser("user_1", {
      client,
      mode: "initial-backfill",
      now: () => FIXED_NOW_MS,
      backfillDays: 30,
      perPage: 200,
    });

    const [, params] = listAthleteActivities.mock.calls[0] as [
      unknown,
      { after?: number },
    ];
    const expectedAfter = Math.floor(FIXED_NOW_MS / 1000) - 30 * SECONDS_PER_DAY;
    expect(params.after).toBe(expectedAfter);
  });

  it("marca a conexão como CONNECTED e registra o sucesso ao concluir", async () => {
    const { client } = fakeClient(async (_ctx, params) =>
      params.page === 1 ? [buildSummaryActivity()] : [],
    );

    await syncModule.syncStravaForUser("user_1", {
      client,
      mode: "initial-backfill",
      now: () => FIXED_NOW_MS,
      perPage: 200,
    });

    const conn = dbMock.stores.connectionsByUser.get("user_1");
    expect(conn?.status).toBe("CONNECTED");
    expect(conn?.lastSuccessAt).toEqual(new Date(FIXED_NOW_MS));
  });
});

// ---------------------------------------------------------------------------
// idempotência
// ---------------------------------------------------------------------------
describe("syncStravaForUser — idempotência", () => {
  beforeEach(() => {
    dbMock.seedConnection("user_1", {
      id: "conn_1",
      status: "CONNECTED",
      lastSyncAt: null,
      lastSuccessAt: null,
    });
  });

  it("1ª execução cria; 2ª execução (mesmas atividades) atualiza sem duplicar", async () => {
    const listImpl: ListImpl = async (_ctx, params) =>
      params.page === 1 ? [buildSummaryActivity(), buildSummaryRun()] : [];

    const first = fakeClient(listImpl);
    const firstRun = await syncModule.syncStravaForUser("user_1", {
      client: first.client,
      mode: "initial-backfill",
      now: () => FIXED_NOW_MS,
      perPage: 200,
    });

    expect(firstRun.status).toBe("synced");
    expect(firstRun.syncedCount).toBe(2);
    expect(firstRun.createdCount).toBe(2);
    expect(dbMock.stores.activities.size).toBe(2);

    const second = fakeClient(listImpl);
    const secondRun = await syncModule.syncStravaForUser("user_1", {
      client: second.client,
      mode: "initial-backfill",
      now: () => FIXED_NOW_MS,
      perPage: 200,
    });

    expect(secondRun.status).toBe("synced");
    expect(secondRun.syncedCount).toBe(2);
    // Nada de novo criado — o upsert idempotente atualizou as existentes.
    expect(secondRun.createdCount).toBe(0);
    // Sem duplicação: continua com 2 atividades.
    expect(dbMock.stores.activities.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// rate-limited
// ---------------------------------------------------------------------------
describe("syncStravaForUser — rate limited", () => {
  beforeEach(() => {
    dbMock.seedConnection("user_1", {
      id: "conn_1",
      status: "CONNECTED",
      lastSyncAt: null,
      lastSuccessAt: null,
    });
  });

  it("client lança StravaRateLimitExceededError → status rate-limited com retryAfterMs, persiste parcial", async () => {
    const { client } = fakeClient(async (_ctx, params) => {
      if (params.page === 1) {
        return [buildSummaryActivity(), buildSummaryRun()];
      }
      // Na página 2, o Strava responde 429 (remoto).
      throw new clientModule.StravaRateLimitExceededError({
        retryAfterMs: 5000,
        connectionId: "conn_1",
        operation: "list_activities",
      });
    });

    const result = await syncModule.syncStravaForUser("user_1", {
      client,
      mode: "initial-backfill",
      now: () => FIXED_NOW_MS,
      perPage: 2,
    });

    expect(result.status).toBe("rate-limited");
    expect(result.retryAfterMs).toBe(5000);
    // Persistiu o parcial da página 1 (2 atividades) antes de parar.
    expect(result.syncedCount).toBe(2);
    expect(dbMock.stores.activities.size).toBe(2);
    // A conexão continua CONNECTED (rate limit não é erro).
    expect(dbMock.stores.connectionsByUser.get("user_1")?.status).toBe("CONNECTED");
  });

  it("erro do limiter LOCAL (StravaRateLimitError) também resulta em rate-limited", async () => {
    const { client } = fakeClient(async () => {
      throw new rateLimit.StravaRateLimitError({
        retryAfterMs: 9000,
        bucket: "read",
        window: "shortTerm",
      });
    });

    const result = await syncModule.syncStravaForUser("user_1", {
      client,
      mode: "initial-backfill",
      now: () => FIXED_NOW_MS,
      perPage: 200,
    });

    expect(result.status).toBe("rate-limited");
    expect(result.retryAfterMs).toBe(9000);
    expect(result.syncedCount).toBe(0);
  });
});
