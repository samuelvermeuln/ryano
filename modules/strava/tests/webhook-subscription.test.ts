/**
 * Testes de gestão da subscription de webhook do Strava (Task 7.2) —
 * `modules/strava/webhooks/subscription.ts`.
 *
 * Cobre, OFFLINE e determinístico (fetch injetado), as três operações e a
 * reconciliação do espelho local `StravaWebhookSubscription`:
 *
 * - view: none (remoto vazio → limpa espelho) / found (persiste espelho) /
 *   erro HTTP (lança tipado).
 * - create: já existe (VÊ primeiro, não faz POST) / cria (POST form data com os
 *   parâmetros da doc oficial + persiste espelho) / erro HTTP.
 * - delete: com id (204 → remove espelho) / sem id (resolve via view) /
 *   nada a apagar (not-found) / 404 idempotente.
 * - configuração ausente: sem client id/secret → erro NOT_CONFIGURED.
 *
 * ── Estratégia de isolamento ────────────────────────────────────────────────
 * - `fetch` é INJETADO (`options.fetchImpl`) — nenhuma rede real.
 * - `@/server/db` é mockado com um store em memória de subscriptions.
 * - Env definido ANTES do import dinâmico do módulo sob teste (config valida no
 *   import).
 *
 * _Requisitos: 12.7, 20.1, 20.5, 21.2_
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Store Prisma em memória + mock hoisted ───────────────────────────────────
const dbMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const subs = new Map<string, Row>();

  function reset() {
    subs.clear();
  }
  function seed(externalSubscriptionId: string, row: Row = {}) {
    subs.set(externalSubscriptionId, {
      externalSubscriptionId,
      callbackUrl: "",
      status: "ACTIVE",
      ...row,
    });
  }

  const stravaWebhookSubscription = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const id = where.externalSubscriptionId as string;
      if (subs.has(id)) {
        const merged = { ...subs.get(id), ...update };
        subs.set(id, merged);
        return { ...merged };
      }
      const row = { ...create };
      subs.set(id, row);
      return { ...row };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn(async ({ where }: any = {}) => {
      if (!where || Object.keys(where).length === 0) {
        const count = subs.size;
        subs.clear();
        return { count };
      }
      const clause = where.externalSubscriptionId;
      if (clause && typeof clause === "object" && Array.isArray(clause.notIn)) {
        const keep = new Set<string>(clause.notIn);
        let count = 0;
        for (const key of [...subs.keys()]) {
          if (!keep.has(key)) {
            subs.delete(key);
            count += 1;
          }
        }
        return { count };
      }
      if (typeof clause === "string") {
        const existed = subs.delete(clause);
        return { count: existed ? 1 : 0 };
      }
      return { count: 0 };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst: vi.fn(async () => {
      const first = [...subs.values()][0];
      return first ? { ...first } : null;
    }),
  };

  return { prisma: { stravaWebhookSubscription }, reset, seed, stores: { subs } };
});

vi.mock("@/server/db", () => ({ prisma: dbMock.prisma }));

// ── Env-at-import: definido ANTES do import dinâmico ─────────────────────────
process.env.AUTH_SECRET = "test-auth-secret-for-strava-subscription";
process.env.DATA_ENCRYPTION_KEY = "test-data-encryption-key";
process.env.STRAVA_CLIENT_ID = "test-strava-client-id";
process.env.STRAVA_CLIENT_SECRET = "test-strava-client-secret";
process.env.STRAVA_WEBHOOK_CALLBACK_URL =
  "https://ryvano.test/api/integrations/strava/webhook";
process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = "test-verify-token";

let sub: typeof import("@/modules/strava/webhooks/subscription");

beforeAll(async () => {
  sub = await import("@/modules/strava/webhooks/subscription");
});

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

// ── Helpers de fetch fake (retornam Response reais) ──────────────────────────
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

function recordingFetch(handler: FetchHandler) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const safeInit = init ?? {};
    calls.push({ url, init: safeInit });
    return handler(url, safeInit);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

// ---------------------------------------------------------------------------
// view
// ---------------------------------------------------------------------------
describe("viewStravaWebhookSubscription", () => {
  it("remoto vazio → status none e limpa o espelho local", async () => {
    dbMock.seed("stale_1", { callbackUrl: "https://old.example/webhook" });
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse([]));

    const result = await sub.viewStravaWebhookSubscription({ fetchImpl });

    expect(result.status).toBe("none");
    // Espelho obsoleto foi removido.
    expect(dbMock.stores.subs.size).toBe(0);
    // Chamou GET /push_subscriptions com client_id/secret na query.
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("GET");
    const url = new URL(calls[0].url);
    expect(url.pathname.endsWith("/push_subscriptions")).toBe(true);
    expect(url.searchParams.get("client_id")).toBe("test-strava-client-id");
    expect(url.searchParams.get("client_secret")).toBe("test-strava-client-secret");
  });

  it("remoto com uma subscription → found e persiste/reconcilia o espelho", async () => {
    dbMock.seed("stale_1");
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse([
        {
          id: 123456,
          callback_url: "https://ryvano.test/api/integrations/strava/webhook",
          application_id: 42,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
        },
      ]),
    );

    const result = await sub.viewStravaWebhookSubscription({ fetchImpl });

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.subscription.externalSubscriptionId).toBe("123456");
      expect(result.subscription.callbackUrl).toBe(
        "https://ryvano.test/api/integrations/strava/webhook",
      );
      expect(result.subscription.applicationId).toBe("42");
    }
    // Espelho reconciliado: só a subscription remota permanece.
    expect(dbMock.stores.subs.has("123456")).toBe(true);
    expect(dbMock.stores.subs.has("stale_1")).toBe(false);
  });

  it("erro HTTP → lança StravaWebhookSubscriptionError tipado", async () => {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse({ message: "Bad Request" }, 400),
    );

    await expect(
      sub.viewStravaWebhookSubscription({ fetchImpl }),
    ).rejects.toMatchObject({
      name: "StravaWebhookSubscriptionError",
      code: "STRAVA_SUBSCRIPTION_VIEW_FAILED",
      httpStatus: 400,
    });
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------
describe("createStravaWebhookSubscription", () => {
  it("subscription já existe → already-exists sem POST (uma por app)", async () => {
    const { fetchImpl, calls } = recordingFetch((url, init) => {
      // Só o VIEW (GET) deve acontecer.
      expect(init.method).toBe("GET");
      return jsonResponse([{ id: 999, callback_url: "https://ryvano.test/api/integrations/strava/webhook" }]);
    });

    const result = await sub.createStravaWebhookSubscription({ fetchImpl });

    expect(result.status).toBe("already-exists");
    expect(result.subscription.externalSubscriptionId).toBe("999");
    // Nenhum POST foi feito.
    expect(calls.every((c) => c.init.method === "GET")).toBe(true);
  });

  it("nenhuma existente → cria via POST form data e persiste o espelho", async () => {
    const { fetchImpl, calls } = recordingFetch((_url, init) => {
      if (init.method === "GET") {
        return jsonResponse([]); // view: nenhuma
      }
      return jsonResponse({ id: 555222 }, 201); // create
    });

    const result = await sub.createStravaWebhookSubscription({ fetchImpl });

    expect(result.status).toBe("created");
    expect(result.subscription.externalSubscriptionId).toBe("555222");
    expect(dbMock.stores.subs.has("555222")).toBe(true);

    // Confere o POST: método, content-type e parâmetros da doc oficial.
    const post = calls.find((c) => c.init.method === "POST");
    expect(post).toBeDefined();
    const headers = new Headers(post!.init.headers);
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(post!.init.body));
    expect(body.get("client_id")).toBe("test-strava-client-id");
    expect(body.get("client_secret")).toBe("test-strava-client-secret");
    expect(body.get("callback_url")).toBe(
      "https://ryvano.test/api/integrations/strava/webhook",
    );
    expect(body.get("verify_token")).toBe("test-verify-token");
  });

  it("POST falha → lança StravaWebhookSubscriptionError CREATE_FAILED", async () => {
    const { fetchImpl } = recordingFetch((_url, init) => {
      if (init.method === "GET") {
        return jsonResponse([]);
      }
      return jsonResponse(
        { message: "Bad Request", errors: [{ resource: "PushSubscription", field: "callback url", code: "not verifiable" }] },
        400,
      );
    });

    await expect(
      sub.createStravaWebhookSubscription({ fetchImpl }),
    ).rejects.toMatchObject({
      code: "STRAVA_SUBSCRIPTION_CREATE_FAILED",
      httpStatus: 400,
    });
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------
describe("deleteStravaWebhookSubscription", () => {
  it("com id informado + 204 → deleted e remove o espelho", async () => {
    dbMock.seed("123456", {
      callbackUrl: "https://ryvano.test/api/integrations/strava/webhook",
    });
    const { fetchImpl, calls } = recordingFetch(() => new Response(null, { status: 204 }));

    const result = await sub.deleteStravaWebhookSubscription("123456", { fetchImpl });

    expect(result.status).toBe("deleted");
    if (result.status === "deleted") {
      expect(result.externalSubscriptionId).toBe("123456");
    }
    expect(dbMock.stores.subs.has("123456")).toBe(false);
    // DELETE no id, com credenciais na query.
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("DELETE");
    const url = new URL(calls[0].url);
    expect(url.pathname.endsWith("/push_subscriptions/123456")).toBe(true);
    expect(url.searchParams.get("client_id")).toBe("test-strava-client-id");
  });

  it("sem id → resolve pelo VIEW remoto e apaga", async () => {
    const { fetchImpl, calls } = recordingFetch((_url, init) => {
      if (init.method === "GET") {
        return jsonResponse([{ id: 777888 }]);
      }
      return new Response(null, { status: 204 });
    });

    const result = await sub.deleteStravaWebhookSubscription(undefined, { fetchImpl });

    expect(result.status).toBe("deleted");
    if (result.status === "deleted") {
      expect(result.externalSubscriptionId).toBe("777888");
    }
    // Fez VIEW (GET) e depois DELETE.
    expect(calls.some((c) => c.init.method === "GET")).toBe(true);
    const del = calls.find((c) => c.init.method === "DELETE");
    expect(del).toBeDefined();
    expect(new URL(del!.url).pathname.endsWith("/push_subscriptions/777888")).toBe(true);
  });

  it("sem id e sem subscription remota/local → not-found sem DELETE", async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse([]));

    const result = await sub.deleteStravaWebhookSubscription(undefined, { fetchImpl });

    expect(result.status).toBe("not-found");
    // Só o VIEW aconteceu; nenhum DELETE.
    expect(calls.every((c) => c.init.method === "GET")).toBe(true);
  });

  it("404 no DELETE → tratado como deleted (idempotente) e limpa o espelho", async () => {
    dbMock.seed("404id");
    const { fetchImpl } = recordingFetch(() => jsonResponse({ message: "Record Not Found" }, 404));

    const result = await sub.deleteStravaWebhookSubscription("404id", { fetchImpl });

    expect(result.status).toBe("deleted");
    expect(dbMock.stores.subs.has("404id")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// configuração ausente
// ---------------------------------------------------------------------------
describe("configuração ausente", () => {
  it("sem client id/secret → StravaWebhookSubscriptionError NOT_CONFIGURED", async () => {
    vi.resetModules();
    const prevId = process.env.STRAVA_CLIENT_ID;
    const prevSecret = process.env.STRAVA_CLIENT_SECRET;
    delete process.env.STRAVA_CLIENT_ID;
    delete process.env.STRAVA_CLIENT_SECRET;

    const fresh = await import("@/modules/strava/webhooks/subscription");
    const { fetchImpl } = recordingFetch(() => jsonResponse([]));

    await expect(fresh.viewStravaWebhookSubscription({ fetchImpl })).rejects.toMatchObject({
      code: "STRAVA_SUBSCRIPTION_NOT_CONFIGURED",
    });

    // Restaura o ambiente e o registro de módulos para não afetar outros testes.
    process.env.STRAVA_CLIENT_ID = prevId;
    process.env.STRAVA_CLIENT_SECRET = prevSecret;
    vi.resetModules();
  });
});
