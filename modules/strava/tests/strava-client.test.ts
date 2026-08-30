/**
 * Testes do `StravaClient` (Task 6.5) — camada `api/client`.
 *
 * Cobre TODOS os status/cenários exigidos pela tarefa, OFFLINE e determinístico:
 * 200, 401 (refresh+retry e falha após retry), 403 (com `Fault`), 404, 429
 * (retryAfterMs do header `Retry-After`), 5xx, timeout (AbortError) e
 * payload parcial / campo opcional ausente (schema defensivo não quebra).
 *
 * ── Estratégia de isolamento ────────────────────────────────────────────────
 * - `fetch` é injetado (`createStravaClient({ fetchImpl })`) — nenhuma rede real.
 *   As respostas são `Response` reais (globais do Node/undici) com `Headers`,
 *   `.json()`, `.clone()` — fiel ao consumo do código sob teste.
 * - A camada de auth (`@/modules/strava/auth`) é mockada com `vi.mock` para
 *   controlar o token e o caminho de refresh+retry em 401 SEM tocar no banco
 *   nem no cofre de secrets. Assim o teste do client não depende de `@/server/db`.
 * - `resetStravaRateLimiter()` roda em `beforeEach` para não vazar estado de
 *   cota entre os testes.
 *
 * ── Env-at-import (mesma abordagem da Task 5.6) ──────────────────────────────
 * `@/modules/strava/config` faz snapshot de `process.env` no import. Definimos as
 * variáveis em statements top-level ANTES de importar dinamicamente os módulos
 * sob teste em `beforeAll`.
 *
 * _Requisitos: 21.2, 21.4_
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildDetailedActivity,
  buildMinimalActivity,
  buildSummaryActivity,
  buildSummaryRun,
  SANITIZED_ACTIVITY_IDS,
} from "@/modules/strava/tests/fixtures/strava-activities";

// ── Mock da camada de auth (hoisted): controla token + refresh/retry ─────────
const authMock = vi.hoisted(() => {
  const getValidStravaAccessToken = vi.fn(async () => ({
    connectionId: "conn_1",
    accessToken: "access-token-current",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    refreshed: false,
  }));

  const refreshStravaToken = vi.fn(async () => ({
    connectionId: "conn_1",
    accessToken: "access-token-refreshed",
    refreshToken: "refresh-token-current",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    rotated: false,
  }));

  return { getValidStravaAccessToken, refreshStravaToken };
});

vi.mock("@/modules/strava/auth", () => ({
  getValidStravaAccessToken: authMock.getValidStravaAccessToken,
  refreshStravaToken: authMock.refreshStravaToken,
}));

// ── Env-at-import: definido ANTES dos imports dinâmicos ──────────────────────
process.env.AUTH_SECRET = "test-auth-secret-for-strava-client";
process.env.DATA_ENCRYPTION_KEY = "test-data-encryption-key";
process.env.STRAVA_CLIENT_ID = "test-strava-client-id";
process.env.STRAVA_CLIENT_SECRET = "test-strava-client-secret";

// ── Módulos sob teste, carregados após o env estar setado ────────────────────
let clientModule: typeof import("@/modules/strava/api/client/strava-client");
let rateLimit: typeof import("@/modules/strava/infrastructure/rate-limit");

beforeAll(async () => {
  clientModule = await import("@/modules/strava/api/client/strava-client");
  rateLimit = await import("@/modules/strava/infrastructure/rate-limit");
});

// ── Helpers de Response mockado ──────────────────────────────────────────────
type ResponseInit = {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
};

/** Constrói uma `Response` real (undici) com corpo JSON opcional. */
function jsonResponse({ status = 200, headers = {}, body }: ResponseInit): Response {
  const hasBody = body !== undefined;
  return new Response(hasBody ? JSON.stringify(body) : null, {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** `fetchImpl` que devolve, em ordem, cada resposta da fila. */
function sequenceFetch(responses: Response[]) {
  const queue = [...responses];
  return vi.fn(async (..._args: Parameters<typeof fetch>) => {
    const next = queue.shift();
    if (!next) {
      throw new Error("sequenceFetch: sem respostas restantes na fila");
    }
    return next;
  });
}

const CTX = { connectionId: "conn_1", userId: "user_1" } as const;

beforeEach(() => {
  rateLimit.resetStravaRateLimiter();
  authMock.getValidStravaAccessToken.mockClear();
  authMock.refreshStravaToken.mockClear();
});

// ---------------------------------------------------------------------------
// 200 — sucesso
// ---------------------------------------------------------------------------
describe("StravaClient — 200 (sucesso)", () => {
  it("listAthleteActivities retorna as atividades parseadas/validadas", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ body: [buildSummaryActivity(), buildSummaryRun()] }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const activities = await client.listAthleteActivities(CTX, { page: 1, perPage: 200 });

    expect(activities).toHaveLength(2);
    expect(activities[0]?.id).toBe(SANITIZED_ACTIVITY_IDS.ride);
    expect(activities[1]?.sport_type).toBe("Run");
    expect(authMock.getValidStravaAccessToken).toHaveBeenCalledTimes(1);
  });

  it("envia o Bearer token e a query (after/page/per_page)", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: [] })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await client.listAthleteActivities(CTX, { after: 1_700_000_000, page: 2, perPage: 50 });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/athlete/activities");
    expect(url).toContain("after=1700000000");
    expect(url).toContain("page=2");
    expect(url).toContain("per_page=50");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer access-token-current");
  });

  it("getActivityById retorna a atividade detalhada validada", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: buildDetailedActivity() })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const activity = await client.getActivityById(CTX, SANITIZED_ACTIVITY_IDS.ride);

    expect(activity.id).toBe(SANITIZED_ACTIVITY_IDS.ride);
    expect(activity.calories).toBe(720.5);
    expect(activity.splits_metric).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 401 — refresh + retry único
// ---------------------------------------------------------------------------
describe("StravaClient — 401 (refresh + retry)", () => {
  it("força refresh e re-tenta uma vez; segundo 200 → sucesso", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 401, body: { message: "Authorization Error" } }),
      jsonResponse({ body: [buildSummaryActivity()] }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const activities = await client.listAthleteActivities(CTX);

    expect(activities).toHaveLength(1);
    expect(authMock.refreshStravaToken).toHaveBeenCalledTimes(1);
    // 2ª tentativa usa o token renovado.
    const [, secondInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    const headers = secondInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer access-token-refreshed");
  });

  it("401 duas vezes → lança StravaAuthError", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 401, body: { message: "Authorization Error" } }),
      jsonResponse({ status: 401, body: { message: "Authorization Error" } }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.listAthleteActivities(CTX)).rejects.toBeInstanceOf(
      clientModule.StravaAuthError,
    );
    expect(authMock.refreshStravaToken).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 403 / 404 / 5xx — erros HTTP tipados
// ---------------------------------------------------------------------------
describe("StravaClient — erros HTTP", () => {
  it("403 → StravaClientError com httpStatus 403 e Fault parseado", async () => {
    const fault = {
      message: "Forbidden",
      errors: [{ resource: "Activity", field: "id", code: "invalid" }],
    };
    const fetchImpl = sequenceFetch([jsonResponse({ status: 403, body: fault })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityById(CTX, 1)).rejects.toMatchObject({
      name: "StravaClientError",
      httpStatus: 403,
      fault: { message: "Forbidden" },
    });
  });

  it("404 → StravaClientError com httpStatus 404", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 404, body: { message: "Record Not Found" } }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityById(CTX, 999)).rejects.toMatchObject({
      name: "StravaClientError",
      httpStatus: 404,
    });
  });

  it("500 → StravaClientError com httpStatus 500", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 500, body: { message: "Server Error" } }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.listAthleteActivities(CTX)).rejects.toMatchObject({
      name: "StravaClientError",
      httpStatus: 500,
    });
  });
});

// ---------------------------------------------------------------------------
// 429 — rate limit remoto
// ---------------------------------------------------------------------------
describe("StravaClient — 429 (rate limit remoto)", () => {
  it("lança StravaRateLimitExceededError com retryAfterMs do header Retry-After", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({
        status: 429,
        headers: { "Retry-After": "120" },
        body: { message: "Rate Limit Exceeded" },
      }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    let caught: unknown;
    try {
      await client.listAthleteActivities(CTX);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(clientModule.StravaRateLimitExceededError);
    expect((caught as InstanceType<typeof clientModule.StravaRateLimitExceededError>).retryAfterMs).toBe(
      120_000,
    );
  });
});

// ---------------------------------------------------------------------------
// timeout — AbortError
// ---------------------------------------------------------------------------
describe("StravaClient — timeout", () => {
  it("fetch que aborta → StravaClientError code STRAVA_CLIENT_TIMEOUT", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    });
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.listAthleteActivities(CTX)).rejects.toMatchObject({
      name: "StravaClientError",
      code: "STRAVA_CLIENT_TIMEOUT",
    });
  });
});

// ---------------------------------------------------------------------------
// payload parcial / campo opcional ausente — schema defensivo
// ---------------------------------------------------------------------------
describe("StravaClient — payload parcial / campo opcional ausente", () => {
  it("atividade sem HR/potência/mapa ainda valida e lista (não lança)", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: [buildMinimalActivity()] })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const activities = await client.listAthleteActivities(CTX);

    expect(activities).toHaveLength(1);
    expect(activities[0]?.id).toBe(SANITIZED_ACTIVITY_IDS.manual);
    expect(activities[0]?.has_heartrate).toBeUndefined();
    expect(activities[0]?.average_watts).toBeUndefined();
    expect(activities[0]?.map).toBeUndefined();
  });

  it("mescla campo opcional ausente e presente na mesma página sem quebrar", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ body: [buildSummaryActivity(), buildMinimalActivity()] }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const activities = await client.listAthleteActivities(CTX);

    expect(activities).toHaveLength(2);
    expect(activities[0]?.average_heartrate).toBe(142.3);
    expect(activities[1]?.average_heartrate).toBeUndefined();
  });
});
