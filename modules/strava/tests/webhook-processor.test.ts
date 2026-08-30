/**
 * Testes do processor de eventos de webhook do Strava (Task 7.4 / 7.1).
 *
 * Cobre, OFFLINE e determinístico, os desfechos de
 * `processStravaWebhookEvent`:
 *   - create/update: atleta conhecido → busca via fake client → upsert Activity,
 *     marca PROCESSED.
 *   - delete: marca PROCESSED e chama `purgeDeletedActivityData` (Activity
 *     removida do store).
 *   - deauthorization (athlete + authorized="false"): chama
 *     `purgeDeauthorizedUserData` (secrets/details/activities removidos, conexão
 *     DISCONNECTED).
 *   - idempotência: evento já PROCESSED → "already-processed", sem re-fetch.
 *   - atleta desconhecido → "ignored-unknown-athlete", marca PROCESSED, sem
 *     chamada ao client.
 *   - erro transitório do client → "retry", permanece PENDING, attemptCount++.
 *
 * ── Estratégia de isolamento ────────────────────────────────────────────────
 * - `@/server/db` é mockado com um store em memória cobrindo os models tocados
 *   pelo processor e pela camada de cleanup (`stravaWebhookEvent`,
 *   `stravaConnectionDetails`, `activity`, `wearableSecret`,
 *   `stravaActivityCache`, `wearableConnection`, `$transaction`).
 * - O `StravaClient` é INJETADO (fake com `getActivityById`), evitando rede.
 * - `now` é injetado para determinismo.
 *
 * ── Env-at-import (mesma abordagem das Tasks 5.6/6.5) ────────────────────────
 * Variáveis definidas em statements top-level ANTES do import dinâmico dos
 * módulos sob teste em `beforeAll`.
 *
 * _Requisitos: 21.2_
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WearableProvider } from "@prisma/client";

import {
  buildActivityCreateEvent,
  buildActivityDeleteEvent,
  buildDeauthorizationEvent,
} from "@/modules/strava/tests/fixtures/strava-webhook-events";
import { buildDetailedActivity, SANITIZED_ACTIVITY_IDS, SANITIZED_ATHLETE_ID } from "@/modules/strava/tests/fixtures/strava-activities";

// ── Store Prisma em memória + mock hoisted ───────────────────────────────────
const dbMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const events = new Map<string, Row>();
  const details: Row[] = []; // { athleteId, wearableConnectionId, userId }
  const connections = new Map<string, Row>();
  const activities = new Map<string, Row>();
  const secrets: Row[] = []; // { wearableConnectionId, secretType }
  const cache: Row[] = []; // { wearableConnectionId, stravaActivityId }
  let idSeq = 0;

  function reset() {
    events.clear();
    details.length = 0;
    connections.clear();
    activities.clear();
    secrets.length = 0;
    cache.length = 0;
    idSeq = 0;
  }

  const activityKey = (externalId: string, userId: string) => `${externalId}:${userId}`;

  /** Semeia um evento de webhook (a partir do DTO wire) e devolve o id. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function seedEvent(dto: any, overrides: Row = {}): string {
    const id = `evt_${++idSeq}`;
    events.set(id, {
      id,
      ownerAthleteId: String(dto.owner_id),
      objectType: dto.object_type,
      objectId: String(dto.object_id),
      aspectType: dto.aspect_type,
      eventTime: new Date(dto.event_time * 1000),
      payload: dto,
      processingStatus: "PENDING",
      attemptCount: 0,
      receivedAt: new Date(),
      ...overrides,
    });
    return id;
  }

  function seedConnection(athleteId: string, connectionId: string, userId: string) {
    details.push({ athleteId, wearableConnectionId: connectionId, userId });
    connections.set(connectionId, { id: connectionId, userId, status: "CONNECTED" });
  }

  function seedActivity(externalId: string, userId: string) {
    activities.set(activityKey(externalId, userId), {
      externalId,
      userId,
      provider: WearableProvider.STRAVA,
    });
  }

  function seedSecret(connectionId: string, secretType: string) {
    secrets.push({ wearableConnectionId: connectionId, secretType });
  }

  const stravaWebhookEvent = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: vi.fn(async ({ where }: any) => {
      const row = events.get(where.id);
      return row ? { ...row } : null;
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: vi.fn(async ({ where, take }: any) => {
      let rows = [...events.values()];
      if (where?.processingStatus) {
        rows = rows.filter((r) => r.processingStatus === where.processingStatus);
      }
      rows.sort(
        (a, b) => (a.receivedAt as Date).getTime() - (b.receivedAt as Date).getTime(),
      );
      if (typeof take === "number") rows = rows.slice(0, take);
      return rows.map((r) => ({ ...r }));
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: vi.fn(async ({ where, data }: any) => {
      const row = { ...events.get(where.id), ...data };
      events.set(where.id, row);
      return { ...row };
    }),
  };

  const stravaConnectionDetails = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: vi.fn(async ({ where }: any) => {
      const row = details.find((d) => d.athleteId === where.athleteId);
      if (!row) return null;
      return {
        wearableConnectionId: row.wearableConnectionId,
        wearableConnection: { userId: row.userId },
      };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn(async ({ where }: any) => {
      let count = 0;
      for (let i = details.length - 1; i >= 0; i -= 1) {
        if (details[i].wearableConnectionId === where.wearableConnectionId) {
          details.splice(i, 1);
          count += 1;
        }
      }
      return { count };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn(async ({ where }: any) => {
      let count = 0;
      for (const [key, row] of activities) {
        if (where.provider !== undefined && row.provider !== where.provider) continue;
        if (where.userId !== undefined && row.userId !== where.userId) continue;
        if (where.externalId !== undefined && row.externalId !== where.externalId) continue;
        activities.delete(key);
        count += 1;
      }
      return { count };
    }),
  };

  const wearableSecret = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn(async ({ where }: any) => {
      let count = 0;
      for (let i = secrets.length - 1; i >= 0; i -= 1) {
        if (secrets[i].wearableConnectionId === where.wearableConnectionId) {
          secrets.splice(i, 1);
          count += 1;
        }
      }
      return { count };
    }),
  };

  const stravaActivityCache = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn(async ({ where }: any) => {
      let count = 0;
      for (let i = cache.length - 1; i >= 0; i -= 1) {
        const c = cache[i];
        if (c.wearableConnectionId !== where.wearableConnectionId) continue;
        if (
          where.stravaActivityId !== undefined &&
          c.stravaActivityId !== where.stravaActivityId
        )
          continue;
        cache.splice(i, 1);
        count += 1;
      }
      return { count };
    }),
  };

  const wearableConnection = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: vi.fn(async ({ where, data }: any) => {
      const row = { ...connections.get(where.id), ...data };
      connections.set(where.id, row);
      return { ...row };
    }),
  };

  const prisma: Row = {
    stravaWebhookEvent,
    stravaConnectionDetails,
    activity,
    wearableSecret,
    stravaActivityCache,
    wearableConnection,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn(async (arg: any) => {
      // Forma callback (purgeDeauthorizedUserData) e forma array (purgeDeleted).
      if (typeof arg === "function") return arg(prisma);
      return Promise.all(arg);
    }),
  };

  return {
    prisma,
    reset,
    seedEvent,
    seedConnection,
    seedActivity,
    seedSecret,
    mocks: { activityDeleteMany: activity.deleteMany },
    stores: { events, details, connections, activities, secrets, cache },
  };
});

vi.mock("@/server/db", () => ({ prisma: dbMock.prisma }));

// ── Env-at-import: definido ANTES dos imports dinâmicos ──────────────────────
process.env.AUTH_SECRET = "test-auth-secret-for-strava-webhook-processor";
process.env.DATA_ENCRYPTION_KEY = "test-data-encryption-key";
process.env.STRAVA_CLIENT_ID = "test-strava-client-id";
process.env.STRAVA_CLIENT_SECRET = "test-strava-client-secret";
process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = "sanitized-webhook-verify-token";

// ── Módulos sob teste, carregados após o env estar setado ────────────────────
let processor: typeof import("@/modules/strava/webhooks/processor");
let clientModule: typeof import("@/modules/strava/api/client/strava-client");

beforeAll(async () => {
  processor = await import("@/modules/strava/webhooks/processor");
  clientModule = await import("@/modules/strava/api/client/strava-client");
});

// ── Fake StravaClient injetável (só precisa de getActivityById) ──────────────
type GetActivityImpl = (ctx: unknown, id: string | number) => Promise<unknown>;

function fakeClient(getActivityImpl: GetActivityImpl) {
  const getActivityById = vi.fn(getActivityImpl);
  return {
    client: { getActivityById } as unknown as import("@/modules/strava/api/client/strava-client").StravaClient,
    getActivityById,
  };
}

const ATHLETE_ID = String(SANITIZED_ATHLETE_ID);
const CONNECTION_ID = "conn_strava_1";
const USER_ID = "user_1";
const FIXED_NOW_MS = Date.UTC(2024, 5, 1, 12, 0, 0);

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// create/update → fetch + upsert + PROCESSED
// ---------------------------------------------------------------------------
describe("processStravaWebhookEvent — create/update", () => {
  it("atleta conhecido → busca via client, upsert Activity, marca PROCESSED", async () => {
    dbMock.seedConnection(ATHLETE_ID, CONNECTION_ID, USER_ID);
    const eventId = dbMock.seedEvent(buildActivityCreateEvent());

    const { client, getActivityById } = fakeClient(async () => buildDetailedActivity());

    const outcome = await processor.processStravaWebhookEvent(eventId, {
      client,
      now: () => FIXED_NOW_MS,
    });

    expect(outcome).toBe("processed");
    expect(getActivityById).toHaveBeenCalledTimes(1);
    // Upsertou a atividade (chaveada por externalId/userId).
    expect(dbMock.stores.activities.size).toBe(1);
    // Evento marcado PROCESSED.
    expect(dbMock.stores.events.get(eventId)?.processingStatus).toBe("PROCESSED");
  });

  it("aspect_type=update também busca e faz upsert (idempotente)", async () => {
    dbMock.seedConnection(ATHLETE_ID, CONNECTION_ID, USER_ID);
    const eventId = dbMock.seedEvent(
      buildActivityCreateEvent({ aspect_type: "update", updates: { title: "x" } }),
    );

    const { client, getActivityById } = fakeClient(async () => buildDetailedActivity());

    const outcome = await processor.processStravaWebhookEvent(eventId, { client });

    expect(outcome).toBe("processed");
    expect(getActivityById).toHaveBeenCalledTimes(1);
    expect(dbMock.stores.activities.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// delete → purgeDeletedActivityData
// ---------------------------------------------------------------------------
describe("processStravaWebhookEvent — delete", () => {
  it("marca PROCESSED e remove a Activity local (purgeDeletedActivityData)", async () => {
    dbMock.seedConnection(ATHLETE_ID, CONNECTION_ID, USER_ID);
    const deleteEvent = buildActivityDeleteEvent();
    // Atividade local pré-existente com o mesmo externalId do evento.
    dbMock.seedActivity(String(deleteEvent.object_id), USER_ID);
    const eventId = dbMock.seedEvent(deleteEvent);

    const { client, getActivityById } = fakeClient(async () => buildDetailedActivity());

    const outcome = await processor.processStravaWebhookEvent(eventId, {
      client,
      now: () => FIXED_NOW_MS,
    });

    expect(outcome).toBe("processed");
    // Não busca a atividade na API em delete.
    expect(getActivityById).not.toHaveBeenCalled();
    // purge removeu a atividade local.
    expect(dbMock.stores.activities.size).toBe(0);
    expect(dbMock.mocks.activityDeleteMany).toHaveBeenCalled();
    expect(dbMock.stores.events.get(eventId)?.processingStatus).toBe("PROCESSED");
  });
});

// ---------------------------------------------------------------------------
// deauthorization → purgeDeauthorizedUserData
// ---------------------------------------------------------------------------
describe("processStravaWebhookEvent — deauthorization", () => {
  it("athlete + authorized=false → purga secrets/detalhes/atividades e DISCONNECTED", async () => {
    dbMock.seedConnection(ATHLETE_ID, CONNECTION_ID, USER_ID);
    dbMock.seedSecret(CONNECTION_ID, "STRAVA_ACCESS_TOKEN");
    dbMock.seedSecret(CONNECTION_ID, "STRAVA_REFRESH_TOKEN");
    dbMock.seedActivity("9000000001", USER_ID);
    dbMock.seedActivity("9000000002", USER_ID);
    const eventId = dbMock.seedEvent(buildDeauthorizationEvent());

    const { client, getActivityById } = fakeClient(async () => buildDetailedActivity());

    const outcome = await processor.processStravaWebhookEvent(eventId, {
      client,
      now: () => FIXED_NOW_MS,
    });

    expect(outcome).toBe("processed");
    expect(getActivityById).not.toHaveBeenCalled();
    // Secrets, detalhes e atividades do Strava removidos.
    expect(dbMock.stores.secrets).toHaveLength(0);
    expect(dbMock.stores.details).toHaveLength(0);
    expect(dbMock.stores.activities.size).toBe(0);
    // Conexão marcada DISCONNECTED.
    expect(dbMock.stores.connections.get(CONNECTION_ID)?.status).toBe("DISCONNECTED");
    expect(dbMock.stores.events.get(eventId)?.processingStatus).toBe("PROCESSED");
  });
});

// ---------------------------------------------------------------------------
// idempotência: evento já PROCESSED
// ---------------------------------------------------------------------------
describe("processStravaWebhookEvent — idempotência", () => {
  it("evento já PROCESSED → already-processed, sem re-fetch", async () => {
    dbMock.seedConnection(ATHLETE_ID, CONNECTION_ID, USER_ID);
    const eventId = dbMock.seedEvent(buildActivityCreateEvent(), {
      processingStatus: "PROCESSED",
    });

    const { client, getActivityById } = fakeClient(async () => buildDetailedActivity());

    const outcome = await processor.processStravaWebhookEvent(eventId, { client });

    expect(outcome).toBe("already-processed");
    expect(getActivityById).not.toHaveBeenCalled();
    expect(dbMock.stores.activities.size).toBe(0);
  });

  it("id inexistente → not-found", async () => {
    const { client } = fakeClient(async () => buildDetailedActivity());
    const outcome = await processor.processStravaWebhookEvent("missing", { client });
    expect(outcome).toBe("not-found");
  });
});

// ---------------------------------------------------------------------------
// atleta desconhecido
// ---------------------------------------------------------------------------
describe("processStravaWebhookEvent — atleta desconhecido", () => {
  it("ownerAthleteId sem conexão → ignored-unknown-athlete, marca PROCESSED, sem client", async () => {
    // Não semeia conexão para este atleta.
    const eventId = dbMock.seedEvent(buildActivityCreateEvent({ owner_id: 7654321 }));

    const { client, getActivityById } = fakeClient(async () => buildDetailedActivity());

    const outcome = await processor.processStravaWebhookEvent(eventId, {
      client,
      now: () => FIXED_NOW_MS,
    });

    expect(outcome).toBe("ignored-unknown-athlete");
    expect(getActivityById).not.toHaveBeenCalled();
    expect(dbMock.stores.events.get(eventId)?.processingStatus).toBe("PROCESSED");
    expect(dbMock.stores.activities.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// erro transitório do client → retry
// ---------------------------------------------------------------------------
describe("processStravaWebhookEvent — retry transitório", () => {
  it("timeout do client → retry, permanece PENDING, attemptCount incrementado", async () => {
    dbMock.seedConnection(ATHLETE_ID, CONNECTION_ID, USER_ID);
    const eventId = dbMock.seedEvent(buildActivityCreateEvent());

    const { client } = fakeClient(async () => {
      throw new clientModule.StravaClientError({
        code: "STRAVA_CLIENT_TIMEOUT",
        message: "timeout",
        connectionId: CONNECTION_ID,
        operation: "get_activity",
      });
    });

    const outcome = await processor.processStravaWebhookEvent(eventId, {
      client,
      now: () => FIXED_NOW_MS,
    });

    expect(outcome).toBe("retry");
    const stored = dbMock.stores.events.get(eventId);
    expect(stored?.processingStatus).toBe("PENDING");
    expect(stored?.attemptCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// batch: processPendingStravaWebhookEvents
// ---------------------------------------------------------------------------
describe("processPendingStravaWebhookEvents — batch", () => {
  it("processa os PENDING e agrega as contagens por desfecho", async () => {
    dbMock.seedConnection(ATHLETE_ID, CONNECTION_ID, USER_ID);
    // 1 create (processado) + 1 de atleta desconhecido (ignorado).
    dbMock.seedEvent(buildActivityCreateEvent());
    dbMock.seedEvent(buildActivityCreateEvent({ owner_id: 7654321, object_id: 42 }));

    const { client } = fakeClient(async () => buildDetailedActivity());

    const result = await processor.processPendingStravaWebhookEvents({
      client,
      now: () => FIXED_NOW_MS,
    });

    expect(result.total).toBe(2);
    expect(result.processed).toBe(1);
    expect(result.ignored).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.retried).toBe(0);
  });
});
