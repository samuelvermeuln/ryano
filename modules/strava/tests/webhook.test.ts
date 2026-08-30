/**
 * Testes do webhook do Strava — challenge (GET) e ingestão do evento (POST),
 * Task 7.4.
 *
 * Cobre, OFFLINE e determinístico:
 *
 * Challenge / GET (validação da subscription):
 *   - verify_token válido + mode=subscribe + challenge → ok:true, ecoa challenge.
 *   - verify_token errado → ok:false (403 no handler).
 *   - mode/challenge ausentes → ok:false.
 *
 * POST ingest:
 *   - payload de create válido → persiste StravaWebhookEvent PENDING (campos).
 *   - evento duplicado (mesmo object_id/aspect_type/event_time) → NÃO cria 2ª
 *     linha (dedupe), retorna "duplicate".
 *   - payload inválido → rejeitado (nenhuma linha; handler responde 400).
 *
 * ── Estratégia de isolamento ────────────────────────────────────────────────
 * - `@/server/db` é mockado com um store em memória (`stravaWebhookEvent`:
 *   findFirst/create), expondo o store para asserções.
 * - `now` é injetado para tornar `expiresAt` determinístico.
 * - Os handlers HTTP são exercitados com `Request`/`Response` reais (node).
 *
 * ── Env-at-import (mesma abordagem das Tasks 5.6/6.5) ────────────────────────
 * Variáveis definidas em statements top-level ANTES do import dinâmico dos
 * módulos sob teste em `beforeAll` (o config faz snapshot de `process.env`).
 *
 * _Requisitos: 21.2_
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildActivityCreateEvent,
  FIXTURE_EVENT_TIME_SECONDS,
  SANITIZED_SUBSCRIPTION_ID,
} from "@/modules/strava/tests/fixtures/strava-webhook-events";
import { SANITIZED_ACTIVITY_IDS, SANITIZED_ATHLETE_ID } from "@/modules/strava/tests/fixtures/strava-activities";

// ── Store Prisma em memória + mock hoisted ───────────────────────────────────
const dbMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const events: Row[] = [];
  let idSeq = 0;

  function reset() {
    events.length = 0;
    idSeq = 0;
  }

  const stravaWebhookEvent = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst: vi.fn(async ({ where }: any) => {
      const match = events.find(
        (e) =>
          e.objectType === where.objectType &&
          e.objectId === where.objectId &&
          e.aspectType === where.aspectType &&
          (e.eventTime as Date).getTime() === (where.eventTime as Date).getTime(),
      );
      return match ? { id: match.id } : null;
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: vi.fn(async ({ data }: any) => {
      const id = `evt_${++idSeq}`;
      const row = { id, attemptCount: 0, receivedAt: new Date(), ...data };
      events.push(row);
      return { id };
    }),
  };

  const prisma = { stravaWebhookEvent };

  return { prisma, reset, stores: { events } };
});

vi.mock("@/server/db", () => ({ prisma: dbMock.prisma }));

// ── Env-at-import: definido ANTES dos imports dinâmicos ──────────────────────
const VERIFY_TOKEN = "sanitized-webhook-verify-token";
process.env.AUTH_SECRET = "test-auth-secret-for-strava-webhook";
process.env.DATA_ENCRYPTION_KEY = "test-data-encryption-key";
process.env.STRAVA_CLIENT_ID = "test-strava-client-id";
process.env.STRAVA_CLIENT_SECRET = "test-strava-client-secret";
process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;

// ── Módulos sob teste, carregados após o env estar setado ────────────────────
let validation: typeof import("@/modules/strava/webhooks/validation");
let handler: typeof import("@/modules/strava/webhooks/handler");

beforeAll(async () => {
  validation = await import("@/modules/strava/webhooks/validation");
  handler = await import("@/modules/strava/webhooks/handler");
});

const WEBHOOK_URL = "http://localhost/api/integrations/strava/webhook";
const FIXED_NOW_MS = Date.UTC(2024, 5, 1, 12, 0, 0);

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Challenge (validação) — verifyStravaWebhookChallenge
// ---------------------------------------------------------------------------
describe("verifyStravaWebhookChallenge", () => {
  it("verify_token válido + subscribe + challenge → ok, ecoa challenge", () => {
    const result = validation.verifyStravaWebhookChallenge({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "challenge-abc-123",
    });

    expect(result).toEqual({ ok: true, challenge: "challenge-abc-123" });
  });

  it("verify_token errado → ok:false (invalid_verify_token)", () => {
    const result = validation.verifyStravaWebhookChallenge({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong-token",
      "hub.challenge": "challenge-abc-123",
    });

    expect(result).toEqual({ ok: false, reason: "invalid_verify_token" });
  });

  it("mode diferente de subscribe → ok:false (invalid_mode)", () => {
    const result = validation.verifyStravaWebhookChallenge({
      "hub.mode": "unsubscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "challenge-abc-123",
    });

    expect(result).toEqual({ ok: false, reason: "invalid_mode" });
  });

  it("challenge ausente/vazio → ok:false (missing_challenge)", () => {
    const missing = validation.verifyStravaWebhookChallenge({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
    });
    expect(missing).toEqual({ ok: false, reason: "missing_challenge" });

    const empty = validation.verifyStravaWebhookChallenge({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "   ",
    });
    expect(empty).toEqual({ ok: false, reason: "missing_challenge" });
  });
});

// ---------------------------------------------------------------------------
// GET handler — handleStravaWebhookGet
// ---------------------------------------------------------------------------
describe("handleStravaWebhookGet", () => {
  it("challenge válido → 200 com { \"hub.challenge\": <valor> }", async () => {
    const url = new URL(WEBHOOK_URL);
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.verify_token", VERIFY_TOKEN);
    url.searchParams.set("hub.challenge", "challenge-echo-42");

    const res = await handler.handleStravaWebhookGet(new Request(url));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ "hub.challenge": "challenge-echo-42" });
  });

  it("verify_token inválido → 403", async () => {
    const url = new URL(WEBHOOK_URL);
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.verify_token", "wrong-token");
    url.searchParams.set("hub.challenge", "challenge-echo-42");

    const res = await handler.handleStravaWebhookGet(new Request(url));

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST ingest — ingestStravaWebhookEvent
// ---------------------------------------------------------------------------
describe("ingestStravaWebhookEvent", () => {
  it("payload de create válido → persiste StravaWebhookEvent PENDING", async () => {
    const event = buildActivityCreateEvent();

    const result = await handler.ingestStravaWebhookEvent(event, {
      now: () => FIXED_NOW_MS,
    });

    expect(result.status).toBe("persisted");
    expect(dbMock.stores.events).toHaveLength(1);

    const stored = dbMock.stores.events[0];
    expect(stored.processingStatus).toBe(handler.STRAVA_WEBHOOK_STATUS_PENDING);
    expect(stored.objectType).toBe("activity");
    expect(stored.aspectType).toBe("create");
    // ids numéricos do Strava são persistidos como string.
    expect(stored.objectId).toBe(String(SANITIZED_ACTIVITY_IDS.ride));
    expect(stored.ownerAthleteId).toBe(String(SANITIZED_ATHLETE_ID));
    expect((stored.eventTime as Date).getTime()).toBe(FIXTURE_EVENT_TIME_SECONDS * 1000);
    // expiresAt é now + TTL (determinístico via now injetado).
    expect((stored.expiresAt as Date).getTime()).toBeGreaterThan(FIXED_NOW_MS);
  });

  it("evento duplicado (mesmo object_id/aspect_type/event_time) → não cria 2ª linha", async () => {
    const event = buildActivityCreateEvent();

    const first = await handler.ingestStravaWebhookEvent(event, { now: () => FIXED_NOW_MS });
    const second = await handler.ingestStravaWebhookEvent(event, { now: () => FIXED_NOW_MS });

    expect(first.status).toBe("persisted");
    expect(second.status).toBe("duplicate");
    // Dedupe: apenas 1 linha persistida.
    expect(dbMock.stores.events).toHaveLength(1);
    expect(dbMock.prisma.stravaWebhookEvent.create).toHaveBeenCalledTimes(1);
  });

  it("payload inválido (campos faltando/tipos errados) → invalid, sem criar linha", async () => {
    // Falta owner_id/subscription_id/event_time e object_id com tipo errado.
    const invalid = { object_type: "activity", object_id: "not-a-number", aspect_type: "create" };

    const result = await handler.ingestStravaWebhookEvent(invalid);

    expect(result.status).toBe("invalid");
    expect(dbMock.stores.events).toHaveLength(0);
    expect(dbMock.prisma.stravaWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("object_type fora do enum → invalid", async () => {
    const invalid = buildActivityCreateEvent({ object_type: "segment" });
    const result = await handler.ingestStravaWebhookEvent(invalid);
    expect(result.status).toBe("invalid");
    expect(dbMock.stores.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST handler — handleStravaWebhookPost
// ---------------------------------------------------------------------------
describe("handleStravaWebhookPost", () => {
  function postRequest(body: unknown): Request {
    return new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("payload válido → 200 { ok: true } e persiste o evento", async () => {
    const res = await handler.handleStravaWebhookPost(
      postRequest(buildActivityCreateEvent({ subscription_id: SANITIZED_SUBSCRIPTION_ID })),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(dbMock.stores.events).toHaveLength(1);
  });

  it("payload com shape inválido → 400 e nenhuma linha criada", async () => {
    const res = await handler.handleStravaWebhookPost(
      postRequest({ object_type: "activity", aspect_type: "create" }),
    );

    expect(res.status).toBe(400);
    expect(dbMock.stores.events).toHaveLength(0);
  });

  it("JSON malformado → 400", async () => {
    const req = new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });

    const res = await handler.handleStravaWebhookPost(req);
    expect(res.status).toBe(400);
  });
});
