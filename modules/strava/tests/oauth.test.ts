/**
 * Testes de OAuth do módulo Strava (Task 5.6).
 *
 * Cobre: state válido/inválido (assinatura/expiração), authorize URL, troca de
 * código com scope parcial + erro HTTP, refresh, refresh com rotação e refresh
 * concorrente (coalescência do lock). Tudo OFFLINE: `fetch` é injetado e retorna
 * fixtures SANITIZADAS (`./fixtures/strava-token-responses.ts`, Req 21.3). O
 * Prisma é mockado (`@/server/db`) com um store em memória; o cofre de secrets
 * real roda de verdade (round-trip de encrypt/decrypt).
 *
 * ── Env-at-import (abordagem B) ────────────────────────────────────────────
 * `@/server/env` e `@/modules/strava/config/env` fazem snapshot de `process.env`
 * no momento do import; `oauth.ts` lança sem `AUTH_SECRET`/`DATA_ENCRYPTION_KEY`
 * e o cofre exige `DATA_ENCRYPTION_KEY`. Como imports estáticos ES são içados
 * para o topo (executados antes de qualquer statement), aqui só importamos
 * estaticamente `vitest` e as fixtures — nenhum deles lê env. As variáveis são
 * definidas em statement top-level e os módulos sob teste são importados
 * DINAMICAMENTE em `beforeAll`, garantindo que o snapshot capture os valores.
 *
 * _Requisitos: 21.2, 21.3_
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildInitialExchangeResponse,
  buildNonRotatedRefreshResponse,
  buildRotatedRefreshResponse,
  FIXTURE_FUTURE_EXPIRES_AT,
  SANITIZED_STRAVA_ATHLETE_ID,
  SANITIZED_TOKENS,
} from "@/modules/strava/tests/fixtures/strava-token-responses";

// ── Store Prisma em memória + mock hoisted ─────────────────────────────────
// vi.hoisted roda antes dos imports; expõe o store para asserções e reset.
const dbMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const connectionsById = new Map<string, Row>();
  const connectionsByUserProvider = new Map<string, string>();
  const details = new Map<string, Row>();
  const secrets = new Map<string, Row>();
  let idSeq = 0;

  function reset() {
    connectionsById.clear();
    connectionsByUserProvider.clear();
    details.clear();
    secrets.clear();
    idSeq = 0;
  }

  const wearableConnection = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const { userId, provider } = where.userId_provider;
      const key = `${userId}:${provider}`;
      const existingId = connectionsByUserProvider.get(key);

      if (existingId) {
        const row = { ...connectionsById.get(existingId), ...update };
        connectionsById.set(existingId, row);
        return { ...row };
      }

      const id = `conn_${++idSeq}`;
      const row = { id, ...create };
      connectionsById.set(id, row);
      connectionsByUserProvider.set(key, id);
      return { ...row };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: vi.fn(async ({ where }: any) => {
      if (where.id) {
        const row = connectionsById.get(where.id);
        return row ? { ...row } : null;
      }

      if (where.userId_provider) {
        const { userId, provider } = where.userId_provider;
        const id = connectionsByUserProvider.get(`${userId}:${provider}`);
        const row = id ? connectionsById.get(id) : undefined;
        return row ? { ...row } : null;
      }

      return null;
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: vi.fn(async ({ where, data }: any) => {
      const row = { ...connectionsById.get(where.id), ...data };
      connectionsById.set(where.id, row);
      return { ...row };
    }),
  };

  const stravaConnectionDetails = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.wearableConnectionId;

      if (details.has(key)) {
        const row = { ...details.get(key), ...update };
        details.set(key, row);
        return { ...row };
      }

      const row = { ...create };
      details.set(key, row);
      return { ...row };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateMany: vi.fn(async ({ where, data }: any) => {
      const key = where.wearableConnectionId;

      if (details.has(key)) {
        details.set(key, { ...details.get(key), ...data });
        return { count: 1 };
      }

      return { count: 0 };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: vi.fn(async ({ where }: any) => {
      const row = details.get(where.wearableConnectionId);
      return row ? { ...row } : null;
    }),
  };

  const wearableSecret = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const { wearableConnectionId, secretType } = where.wearableConnectionId_secretType;
      const key = `${wearableConnectionId}:${secretType}`;

      if (secrets.has(key)) {
        const row = { ...secrets.get(key), ...update };
        secrets.set(key, row);
        return { ...row };
      }

      const row = { ...create };
      secrets.set(key, row);
      return { ...row };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: vi.fn(async ({ where }: any) => {
      const { wearableConnectionId, secretType } = where.wearableConnectionId_secretType;
      const row = secrets.get(`${wearableConnectionId}:${secretType}`);
      return row ? { ...row } : null;
    }),
  };

  const prisma = {
    wearableConnection,
    stravaConnectionDetails,
    wearableSecret,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn(async (cb: any) => cb(prisma)),
  };

  return { prisma, reset, stores: { connectionsById, details, secrets } };
});

vi.mock("@/server/db", () => ({ prisma: dbMock.prisma }));

// ── Env-at-import: definido ANTES dos imports dinâmicos (abordagem B) ──────
process.env.AUTH_SECRET = "test-auth-secret-for-strava-oauth-state";
process.env.DATA_ENCRYPTION_KEY = "test-data-encryption-key";
process.env.STRAVA_CLIENT_ID = "test-strava-client-id";
process.env.STRAVA_CLIENT_SECRET = "test-strava-client-secret";
process.env.STRAVA_OAUTH_CALLBACK_URL =
  "http://localhost/api/integrations/strava/callback";

// ── Módulos sob teste, carregados dinamicamente após o env estar setado ────
let oauth: typeof import("@/modules/strava/auth/oauth");
let tokenExchange: typeof import("@/modules/strava/auth/token-exchange");
let tokenRefresh: typeof import("@/modules/strava/auth/token-refresh");
let vault: typeof import("@/server/crypto/secret-vault");

beforeAll(async () => {
  oauth = await import("@/modules/strava/auth/oauth");
  tokenExchange = await import("@/modules/strava/auth/token-exchange");
  tokenRefresh = await import("@/modules/strava/auth/token-refresh");
  vault = await import("@/server/crypto/secret-vault");
});

// ── Helpers de fetch mockado (Response-like mínimo consumido pelo código) ───
function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeFetch(body: unknown, init?: { ok?: boolean; status?: number }) {
  return vi.fn(async () => jsonResponse(body, init));
}

const ACCESS_KEY = (connectionId: string) => `${connectionId}:STRAVA_ACCESS_TOKEN`;
const REFRESH_KEY = (connectionId: string) => `${connectionId}:STRAVA_REFRESH_TOKEN`;

// ---------------------------------------------------------------------------
// 1. state válido/inválido (Req 10.2)
// ---------------------------------------------------------------------------
describe("state OAuth: geração e validação", () => {
  it("faz round-trip: state válido recupera o userId", () => {
    const state = oauth.createStravaOAuthState("user_1");
    const result = oauth.verifyStravaOAuthState(state);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.userId).toBe("user_1");
      expect(typeof result.issuedAt).toBe("number");
    }
  });

  it("assinatura adulterada → bad_signature", () => {
    const state = oauth.createStravaOAuthState("user_1");
    const [payload, signature] = state.split(".");
    // Altera 1 caractere da assinatura, preservando o comprimento.
    const flipped = signature[0] === "A" ? "B" : "A";
    const tampered = `${payload}.${flipped}${signature.slice(1)}`;

    const result = oauth.verifyStravaOAuthState(tampered);

    expect(result).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("payload/garbage sem formato → malformed", () => {
    expect(oauth.verifyStravaOAuthState("garbage-no-dot")).toEqual({
      valid: false,
      reason: "malformed",
    });
    expect(oauth.verifyStravaOAuthState("a.b.c")).toEqual({
      valid: false,
      reason: "malformed",
    });
    expect(oauth.verifyStravaOAuthState("")).toEqual({
      valid: false,
      reason: "malformed",
    });
    expect(oauth.verifyStravaOAuthState(null)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("state expirado (via now/maxAgeSeconds injetados) → expired", () => {
    const state = oauth.createStravaOAuthState("user_1");
    const result = oauth.verifyStravaOAuthState(state, {
      maxAgeSeconds: 1,
      now: Date.now() + 10_000,
    });

    expect(result).toEqual({ valid: false, reason: "expired" });
  });
});

// ---------------------------------------------------------------------------
// 2. authorize URL (Req 10.1, 10.7)
// ---------------------------------------------------------------------------
describe("buildStravaAuthorizeUrl", () => {
  it("monta a URL com todos os parâmetros exigidos", () => {
    const state = oauth.createStravaOAuthState("user_1");
    const url = new URL(oauth.buildStravaAuthorizeUrl({ state }));

    expect(url.searchParams.get("client_id")).toBe("test-strava-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost/api/integrations/strava/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe(state);

    const scope = url.searchParams.get("scope") ?? "";
    expect(scope.split(",")).toContain("activity:read");
    expect(scope).toBe(oauth.DEFAULT_STRAVA_OAUTH_SCOPES.join(","));
  });
});

// ---------------------------------------------------------------------------
// 3. Troca de código: scope parcial + erro HTTP (Req 10.3, 10.4)
// ---------------------------------------------------------------------------
describe("exchangeStravaCode", () => {
  beforeEach(() => {
    dbMock.reset();
    vi.clearAllMocks();
  });

  it("persiste apenas os scopes concedidos (scope parcial) e os secrets cifrados", async () => {
    const fetchImpl = makeFetch(buildInitialExchangeResponse());

    const result = await tokenExchange.exchangeStravaCode({
      userId: "user_1",
      code: "auth-code-sanitized",
      // scope PARCIAL vindo do callback (usuário não concedeu activity:read_all).
      scope: "read,activity:read",
      fetchImpl,
    });

    expect(result.athleteId).toBe(String(SANITIZED_STRAVA_ATHLETE_ID));
    expect(result.scopes).toEqual(["read", "activity:read"]);

    // StravaConnectionDetails persiste exatamente os scopes concedidos.
    const persistedDetails = dbMock.stores.details.get(result.connectionId);
    expect(persistedDetails?.scopes).toEqual(["read", "activity:read"]);
    expect(persistedDetails?.athleteId).toBe(String(SANITIZED_STRAVA_ATHLETE_ID));

    // Ambos os secrets foram upsertados e fazem round-trip no cofre real.
    const accessSecret = dbMock.stores.secrets.get(ACCESS_KEY(result.connectionId));
    const refreshSecret = dbMock.stores.secrets.get(REFRESH_KEY(result.connectionId));
    expect(accessSecret).toBeDefined();
    expect(refreshSecret).toBeDefined();
    expect(vault.decryptSecret(accessSecret as never)).toBe(
      SANITIZED_TOKENS.initialAccess,
    );
    expect(vault.decryptSecret(refreshSecret as never)).toBe(
      SANITIZED_TOKENS.initialRefresh,
    );
  });

  it("status HTTP não-OK → lança StravaTokenExchangeError", async () => {
    const fetchImpl = makeFetch({ message: "Bad Request" }, { status: 400 });

    await expect(
      tokenExchange.exchangeStravaCode({
        userId: "user_1",
        code: "auth-code-sanitized",
        scope: "read",
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(tokenExchange.StravaTokenExchangeError);
  });
});

// ---------------------------------------------------------------------------
// 4/5/6. Refresh, rotação e concorrência (Req 10.5)
// ---------------------------------------------------------------------------
describe("refreshStravaToken", () => {
  let connectionId: string;

  beforeEach(async () => {
    dbMock.reset();
    vi.clearAllMocks();
    tokenRefresh.__resetStravaRefreshLocksForTests();

    // Estabelece a conexão inicial (com refresh token = initialRefresh) via troca.
    const exchange = await tokenExchange.exchangeStravaCode({
      userId: "user_1",
      code: "auth-code-sanitized",
      scope: "read,activity:read",
      fetchImpl: makeFetch(buildInitialExchangeResponse()),
    });
    connectionId = exchange.connectionId;
  });

  it("renova o access token e atualiza accessTokenExpiresAt (sem rotação)", async () => {
    const fetchImpl = makeFetch(buildNonRotatedRefreshResponse());

    const result = await tokenRefresh.refreshStravaToken({ connectionId, fetchImpl });

    expect(result.rotated).toBe(false);
    expect(result.accessToken).toBe(SANITIZED_TOKENS.refreshedAccess);

    // Novo access token persistido (round-trip real do cofre).
    const accessSecret = dbMock.stores.secrets.get(ACCESS_KEY(connectionId));
    expect(vault.decryptSecret(accessSecret as never)).toBe(
      SANITIZED_TOKENS.refreshedAccess,
    );

    // accessTokenExpiresAt atualizado a partir de expires_at.
    const persistedDetails = dbMock.stores.details.get(connectionId);
    expect(persistedDetails?.accessTokenExpiresAt).toEqual(
      new Date(FIXTURE_FUTURE_EXPIRES_AT * 1000),
    );
  });

  it("refresh token rotacionado → rotated=true e novo refresh persistido", async () => {
    const fetchImpl = makeFetch(buildRotatedRefreshResponse());

    const result = await tokenRefresh.refreshStravaToken({ connectionId, fetchImpl });

    expect(result.rotated).toBe(true);
    expect(result.refreshToken).toBe(SANITIZED_TOKENS.rotatedRefresh);

    const refreshSecret = dbMock.stores.secrets.get(REFRESH_KEY(connectionId));
    expect(vault.decryptSecret(refreshSecret as never)).toBe(
      SANITIZED_TOKENS.rotatedRefresh,
    );
  });

  it("refresh concorrente coalescem em uma única chamada de rede", async () => {
    let networkCalls = 0;
    const fetchImpl = vi.fn(async () => {
      networkCalls += 1;
      // Pequeno atraso para garantir sobreposição das duas chamadas.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return jsonResponse(buildNonRotatedRefreshResponse());
    });

    const [a, b] = await Promise.all([
      tokenRefresh.refreshStravaToken({ connectionId, fetchImpl }),
      tokenRefresh.refreshStravaToken({ connectionId, fetchImpl }),
    ]);

    expect(networkCalls).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a.accessToken).toBe(b.accessToken);
    expect(a.accessToken).toBe(SANITIZED_TOKENS.refreshedAccess);
  });
});
