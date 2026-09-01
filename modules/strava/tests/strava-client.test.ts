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
 *
 * ── Task 12.3 (spec `detalhe-atividade-multi-provider`) ─────────────────────
 * Os blocos ao final do arquivo espelham os mesmos cenários (200, 401 com
 * refresh+retry, 429 com `retryAfterMs`, 403/404/5xx, timeout, payload que falha
 * no schema) para `getActivityStreams` e `getActivityLaps`, reaproveitando os
 * mocks de `fetch`/auth acima, e checam a FORMA da requisição (query `keys`
 * separada por vírgula + `key_by_type=true` sempre presente em streams; nenhuma
 * query em laps) e os guards locais de argumento.
 *
 * _Requisitos: 9.1, 9.2, 9.4, 9.5_
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildDetailedActivity,
  buildMinimalActivity,
  buildSummaryActivity,
  buildSummaryRun,
  SANITIZED_ACTIVITY_IDS,
} from "@/modules/strava/tests/fixtures/strava-activities";
import {
  ARRAY_SHAPED_STREAM_PAYLOAD,
  buildEmptyStreamSet,
  buildFullStreamSet,
  buildHeartRateOnlyStreamSet,
  buildStreamSet,
  buildStreamSetWithoutMetadata,
  INVALID_STREAM_SET_PAYLOAD,
  SANITIZED_STREAM_KEYS,
  SANITIZED_STREAM_SAMPLE_COUNT,
} from "@/modules/strava/tests/fixtures/activity-streams";
import {
  buildEmptyLapList,
  buildLapList,
  buildLapWithNullMetrics,
  buildMinimalLap,
  INVALID_LAP_LIST_PAYLOAD,
  OBJECT_SHAPED_LAP_PAYLOAD,
  SANITIZED_LAP_IDS,
} from "@/modules/strava/tests/fixtures/activity-laps";

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
// ===========================================================================
// Task 12.3 — `getActivityStreams` / `getActivityLaps`
// ===========================================================================

/** Extrai `[url, init]` de uma chamada do `fetchImpl` mockado. */
function callAt(
  fetchImpl: ReturnType<typeof sequenceFetch>,
  index: number,
): { url: URL; headers: Record<string, string> } {
  const [rawUrl, init] = fetchImpl.mock.calls[index] as [string, RequestInit];
  return {
    url: new URL(rawUrl),
    headers: (init.headers ?? {}) as Record<string, string>,
  };
}

const STREAM_ID = SANITIZED_ACTIVITY_IDS.ride;

// ---------------------------------------------------------------------------
// getActivityStreams — 200 e forma da requisição
// ---------------------------------------------------------------------------
describe("StravaClient.getActivityStreams — 200 (sucesso)", () => {
  it("retorna o StreamSet indexado por tipo, validado", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: buildStreamSet() })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const streams = await client.getActivityStreams(CTX, STREAM_ID, {
      keys: SANITIZED_STREAM_KEYS,
    });

    expect(streams.heartrate?.data).toEqual([118, 132, 145, 151, 149]);
    expect(streams.time?.data).toHaveLength(SANITIZED_STREAM_SAMPLE_COUNT);
    expect(streams.time?.series_type).toBe("time");
    expect(streams.cadence?.resolution).toBe("high");
    expect(authMock.getValidStravaAccessToken).toHaveBeenCalledTimes(1);
  });

  it("envia keys separada por vírgula, key_by_type=true e o Bearer token", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: buildStreamSet() })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await client.getActivityStreams(CTX, STREAM_ID, { keys: SANITIZED_STREAM_KEYS });

    const { url, headers } = callAt(fetchImpl, 0);
    // A base da API já inclui o prefixo de versão; só o sufixo do path importa.
    expect(url.pathname.endsWith(`/activities/${STREAM_ID}/streams`)).toBe(true);
    expect(url.searchParams.get("keys")).toBe(
      "time,heartrate,cadence,distance,velocity_smooth",
    );
    expect(url.searchParams.get("key_by_type")).toBe("true");
    expect(headers.Authorization).toBe("Bearer access-token-current");
  });

  it("key_by_type=true está presente mesmo com uma única key", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ body: buildHeartRateOnlyStreamSet() }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await client.getActivityStreams(CTX, STREAM_ID, { keys: ["heartrate"] });

    const { url } = callAt(fetchImpl, 0);
    expect(url.searchParams.get("keys")).toBe("heartrate");
    expect(url.searchParams.get("key_by_type")).toBe("true");
  });

  it("normaliza keys (trim + dedupe, preservando a ordem) na query", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: buildStreamSet() })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await client.getActivityStreams(CTX, STREAM_ID, {
      keys: [" time ", "heartrate", "time", "", "cadence"],
    });

    const { url } = callAt(fetchImpl, 0);
    expect(url.searchParams.get("keys")).toBe("time,heartrate,cadence");
  });

  it("aceita o StreamSet rico (latlng, moving, watts, temp, grade_smooth)", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: buildFullStreamSet() })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const streams = await client.getActivityStreams(CTX, STREAM_ID, {
      keys: [...SANITIZED_STREAM_KEYS, "latlng", "moving", "watts"],
    });

    expect(streams.latlng?.data[0]).toEqual([0.001, 0.001]);
    expect(streams.moving?.data).toEqual([false, true, true, true, true]);
    expect(streams.watts?.data).toHaveLength(5);
    expect(streams.grade_smooth?.data).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// getActivityStreams — guards locais (nenhuma cota gasta)
// ---------------------------------------------------------------------------
describe("StravaClient.getActivityStreams — guards locais", () => {
  it("id vazio/em branco → STRAVA_CLIENT_INVALID_ACTIVITY_ID sem chamar fetch", async () => {
    const fetchImpl = sequenceFetch([]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(
      client.getActivityStreams(CTX, "   ", { keys: SANITIZED_STREAM_KEYS }),
    ).rejects.toMatchObject({
      name: "StravaClientError",
      code: "STRAVA_CLIENT_INVALID_ACTIVITY_ID",
      operation: "get_activity_streams",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(authMock.getValidStravaAccessToken).not.toHaveBeenCalled();
  });

  it("keys vazio → STRAVA_CLIENT_INVALID_STREAM_KEYS sem chamar fetch", async () => {
    const fetchImpl = sequenceFetch([]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(
      client.getActivityStreams(CTX, STREAM_ID, { keys: [] }),
    ).rejects.toMatchObject({
      name: "StravaClientError",
      code: "STRAVA_CLIENT_INVALID_STREAM_KEYS",
      operation: "get_activity_streams",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keys só com strings em branco → STRAVA_CLIENT_INVALID_STREAM_KEYS", async () => {
    const fetchImpl = sequenceFetch([]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(
      client.getActivityStreams(CTX, STREAM_ID, { keys: ["", "   "] }),
    ).rejects.toMatchObject({
      code: "STRAVA_CLIENT_INVALID_STREAM_KEYS",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getActivityStreams — 401 (refresh + retry)
// ---------------------------------------------------------------------------
describe("StravaClient.getActivityStreams — 401 (refresh + retry)", () => {
  it("força refresh, re-tenta uma vez e devolve o StreamSet", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 401, body: { message: "Authorization Error" } }),
      jsonResponse({ body: buildStreamSet() }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const streams = await client.getActivityStreams(CTX, STREAM_ID, {
      keys: SANITIZED_STREAM_KEYS,
    });

    expect(streams.heartrate?.data).toHaveLength(5);
    expect(authMock.refreshStravaToken).toHaveBeenCalledTimes(1);
    // A 2ª tentativa usa o token renovado e a MESMA query.
    const second = callAt(fetchImpl, 1);
    expect(second.headers.Authorization).toBe("Bearer access-token-refreshed");
    expect(second.url.searchParams.get("key_by_type")).toBe("true");
  });

  it("401 duas vezes → StravaAuthError", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 401, body: { message: "Authorization Error" } }),
      jsonResponse({ status: 401, body: { message: "Authorization Error" } }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(
      client.getActivityStreams(CTX, STREAM_ID, { keys: SANITIZED_STREAM_KEYS }),
    ).rejects.toBeInstanceOf(clientModule.StravaAuthError);
    expect(authMock.refreshStravaToken).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getActivityStreams — 429 / 403 / 404 / 5xx / timeout
// ---------------------------------------------------------------------------
describe("StravaClient.getActivityStreams — erros HTTP e timeout", () => {
  it("429 → StravaRateLimitExceededError com retryAfterMs do header", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({
        status: 429,
        headers: { "Retry-After": "90" },
        body: { message: "Rate Limit Exceeded" },
      }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    let caught: unknown;
    try {
      await client.getActivityStreams(CTX, STREAM_ID, { keys: SANITIZED_STREAM_KEYS });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(clientModule.StravaRateLimitExceededError);
    expect(
      (caught as InstanceType<typeof clientModule.StravaRateLimitExceededError>)
        .retryAfterMs,
    ).toBe(90_000);
  });

  it("403 → StravaClientError 403 com Fault parseado (scope insuficiente)", async () => {
    const fault = {
      message: "Forbidden",
      errors: [{ resource: "Activity", field: "id", code: "invalid" }],
    };
    const fetchImpl = sequenceFetch([jsonResponse({ status: 403, body: fault })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(
      client.getActivityStreams(CTX, STREAM_ID, { keys: SANITIZED_STREAM_KEYS }),
    ).rejects.toMatchObject({
      name: "StravaClientError",
      httpStatus: 403,
      operation: "get_activity_streams",
      fault: { message: "Forbidden" },
    });
  });

  it("404 → StravaClientError com httpStatus 404", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 404, body: { message: "Record Not Found" } }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(
      client.getActivityStreams(CTX, 999, { keys: SANITIZED_STREAM_KEYS }),
    ).rejects.toMatchObject({ name: "StravaClientError", httpStatus: 404 });
  });

  it("500 → StravaClientError com httpStatus 500", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 500, body: { message: "Server Error" } }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(
      client.getActivityStreams(CTX, STREAM_ID, { keys: SANITIZED_STREAM_KEYS }),
    ).rejects.toMatchObject({ name: "StravaClientError", httpStatus: 500 });
  });

  it("fetch que aborta → STRAVA_CLIENT_TIMEOUT", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    });
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(
      client.getActivityStreams(CTX, STREAM_ID, { keys: SANITIZED_STREAM_KEYS }),
    ).rejects.toMatchObject({
      name: "StravaClientError",
      code: "STRAVA_CLIENT_TIMEOUT",
    });
  });
});

// ---------------------------------------------------------------------------
// getActivityStreams — payload parcial (ok) vs payload inválido (schema falha)
// ---------------------------------------------------------------------------
describe("StravaClient.getActivityStreams — payload parcial / inválido", () => {
  it("StreamSet só com time+heartrate valida; streams ausentes ficam undefined", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ body: buildHeartRateOnlyStreamSet() }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const streams = await client.getActivityStreams(CTX, STREAM_ID, {
      keys: SANITIZED_STREAM_KEYS,
    });

    expect(streams.heartrate?.data).toHaveLength(5);
    expect(streams.cadence).toBeUndefined();
    expect(streams.velocity_smooth).toBeUndefined();
    expect(streams.latlng).toBeUndefined();
  });

  it("StreamSet vazio ({}) é resposta válida (ausência de dado, não erro)", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: buildEmptyStreamSet() })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const streams = await client.getActivityStreams(CTX, STREAM_ID, {
      keys: SANITIZED_STREAM_KEYS,
    });

    expect(streams.heartrate).toBeUndefined();
    expect(Object.keys(streams)).toHaveLength(0);
  });

  it("stream sem metadados opcionais ainda valida", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ body: buildStreamSetWithoutMetadata() }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const streams = await client.getActivityStreams(CTX, STREAM_ID, {
      keys: ["heartrate"],
    });

    expect(streams.heartrate?.data).toEqual([120, 130, 140]);
    expect(streams.heartrate?.series_type).toBeUndefined();
  });

  it("data com tipos errados → STRAVA_INVALID_RESPONSE", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ body: INVALID_STREAM_SET_PAYLOAD }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(
      client.getActivityStreams(CTX, STREAM_ID, { keys: ["heartrate"] }),
    ).rejects.toMatchObject({
      name: "StravaClientError",
      code: "STRAVA_INVALID_RESPONSE",
      operation: "get_activity_streams",
    });
  });

  it("resposta na forma de ARRAY (sem key_by_type) → STRAVA_INVALID_RESPONSE", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ body: ARRAY_SHAPED_STREAM_PAYLOAD }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(
      client.getActivityStreams(CTX, STREAM_ID, { keys: ["heartrate"] }),
    ).rejects.toMatchObject({ code: "STRAVA_INVALID_RESPONSE" });
  });

  it("corpo não-JSON → STRAVA_INVALID_JSON", async () => {
    const fetchImpl = sequenceFetch([
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(
      client.getActivityStreams(CTX, STREAM_ID, { keys: ["heartrate"] }),
    ).rejects.toMatchObject({ code: "STRAVA_INVALID_JSON" });
  });
});

// ---------------------------------------------------------------------------
// getActivityLaps — 200 e forma da requisição
// ---------------------------------------------------------------------------
describe("StravaClient.getActivityLaps — 200 (sucesso)", () => {
  it("retorna a lista de laps validada", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: buildLapList() })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const laps = await client.getActivityLaps(CTX, STREAM_ID);

    expect(laps).toHaveLength(3);
    expect(laps[0]?.id).toBe(SANITIZED_LAP_IDS.first);
    expect(laps.map((lap) => lap.lap_index)).toEqual([1, 2, 3]);
    expect(laps[1]?.average_heartrate).toBe(145.1);
    expect(authMock.getValidStravaAccessToken).toHaveBeenCalledTimes(1);
  });

  it("NÃO envia query string alguma e usa o path /activities/{id}/laps", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: buildLapList() })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await client.getActivityLaps(CTX, STREAM_ID);

    const [rawUrl] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(rawUrl).not.toContain("?");
    const { url, headers } = callAt(fetchImpl, 0);
    expect(url.pathname.endsWith(`/activities/${STREAM_ID}/laps`)).toBe(true);
    expect([...url.searchParams.keys()]).toHaveLength(0);
    expect(headers.Authorization).toBe("Bearer access-token-current");
  });

  it("lista vazia é resposta válida (atividade sem voltas)", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: buildEmptyLapList() })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityLaps(CTX, STREAM_ID)).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getActivityLaps — guard local
// ---------------------------------------------------------------------------
describe("StravaClient.getActivityLaps — guard local", () => {
  it("id vazio/em branco → STRAVA_CLIENT_INVALID_ACTIVITY_ID sem chamar fetch", async () => {
    const fetchImpl = sequenceFetch([]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityLaps(CTX, "  ")).rejects.toMatchObject({
      name: "StravaClientError",
      code: "STRAVA_CLIENT_INVALID_ACTIVITY_ID",
      operation: "get_activity_laps",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(authMock.getValidStravaAccessToken).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getActivityLaps — 401 (refresh + retry)
// ---------------------------------------------------------------------------
describe("StravaClient.getActivityLaps — 401 (refresh + retry)", () => {
  it("força refresh, re-tenta uma vez e devolve os laps", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 401, body: { message: "Authorization Error" } }),
      jsonResponse({ body: buildLapList() }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const laps = await client.getActivityLaps(CTX, STREAM_ID);

    expect(laps).toHaveLength(3);
    expect(authMock.refreshStravaToken).toHaveBeenCalledTimes(1);
    expect(callAt(fetchImpl, 1).headers.Authorization).toBe(
      "Bearer access-token-refreshed",
    );
  });

  it("401 duas vezes → StravaAuthError", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 401, body: { message: "Authorization Error" } }),
      jsonResponse({ status: 401, body: { message: "Authorization Error" } }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityLaps(CTX, STREAM_ID)).rejects.toBeInstanceOf(
      clientModule.StravaAuthError,
    );
    expect(authMock.refreshStravaToken).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getActivityLaps — 429 / 403 / 404 / 5xx / timeout
// ---------------------------------------------------------------------------
describe("StravaClient.getActivityLaps — erros HTTP e timeout", () => {
  it("429 → StravaRateLimitExceededError com retryAfterMs do header", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({
        status: 429,
        headers: { "Retry-After": "30" },
        body: { message: "Rate Limit Exceeded" },
      }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    let caught: unknown;
    try {
      await client.getActivityLaps(CTX, STREAM_ID);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(clientModule.StravaRateLimitExceededError);
    expect(
      (caught as InstanceType<typeof clientModule.StravaRateLimitExceededError>)
        .retryAfterMs,
    ).toBe(30_000);
  });

  it("403 → StravaClientError 403 com Fault parseado", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 403, body: { message: "Forbidden", errors: [] } }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityLaps(CTX, STREAM_ID)).rejects.toMatchObject({
      name: "StravaClientError",
      httpStatus: 403,
      operation: "get_activity_laps",
      fault: { message: "Forbidden" },
    });
  });

  it("404 → StravaClientError com httpStatus 404", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 404, body: { message: "Record Not Found" } }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityLaps(CTX, 999)).rejects.toMatchObject({
      name: "StravaClientError",
      httpStatus: 404,
    });
  });

  it("502 → StravaClientError com httpStatus 502", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ status: 502, body: { message: "Bad Gateway" } }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityLaps(CTX, STREAM_ID)).rejects.toMatchObject({
      name: "StravaClientError",
      httpStatus: 502,
    });
  });

  it("fetch que aborta → STRAVA_CLIENT_TIMEOUT", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    });
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityLaps(CTX, STREAM_ID)).rejects.toMatchObject({
      name: "StravaClientError",
      code: "STRAVA_CLIENT_TIMEOUT",
    });
  });
});

// ---------------------------------------------------------------------------
// getActivityLaps — payload parcial (ok) vs payload inválido (schema falha)
// ---------------------------------------------------------------------------
describe("StravaClient.getActivityLaps — payload parcial / inválido", () => {
  it("lap sem HR/cadência/potência valida (campos opcionais ausentes)", async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ body: [buildMinimalLap()] })]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const laps = await client.getActivityLaps(CTX, STREAM_ID);

    expect(laps).toHaveLength(1);
    expect(laps[0]?.id).toBe(SANITIZED_LAP_IDS.first);
    expect(laps[0]?.average_heartrate).toBeUndefined();
    expect(laps[0]?.average_watts).toBeUndefined();
  });

  it("mescla lap completo e lap com métricas null na mesma lista", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ body: [...buildLapList(), buildLapWithNullMetrics()] }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    const laps = await client.getActivityLaps(CTX, STREAM_ID);

    expect(laps).toHaveLength(4);
    expect(laps[0]?.average_heartrate).toBe(138.6);
    expect(laps[3]?.average_heartrate).toBeNull();
    expect(laps[3]?.distance).toBeNull();
  });

  it("lap sem `id` → STRAVA_INVALID_RESPONSE", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ body: INVALID_LAP_LIST_PAYLOAD }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityLaps(CTX, STREAM_ID)).rejects.toMatchObject({
      name: "StravaClientError",
      code: "STRAVA_INVALID_RESPONSE",
      operation: "get_activity_laps",
    });
  });

  it("objeto no lugar do array → STRAVA_INVALID_RESPONSE", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ body: OBJECT_SHAPED_LAP_PAYLOAD }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityLaps(CTX, STREAM_ID)).rejects.toMatchObject({
      code: "STRAVA_INVALID_RESPONSE",
    });
  });

  it("corpo não-JSON → STRAVA_INVALID_JSON", async () => {
    const fetchImpl = sequenceFetch([
      new Response("not json at all", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    ]);
    const client = clientModule.createStravaClient({ fetchImpl });

    await expect(client.getActivityLaps(CTX, STREAM_ID)).rejects.toMatchObject({
      code: "STRAVA_INVALID_JSON",
    });
  });
});
