import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __stripSensitiveForTests,
  logIntegrationEvent,
} from "@/modules/shared/integrations/observability/log";
import {
  getIntegrationMetric,
  getIntegrationMetricsSnapshot,
  incrementIntegrationMetric,
  resetIntegrationMetrics,
} from "@/modules/shared/integrations/observability/metrics";

describe("logIntegrationEvent — sensitive-key stripping (Req 20.1/20.2)", () => {
  const sensitiveMeta = {
    provider: "STRAVA" as const,
    operation: "token_refresh",
    status: "refreshed",
    connectionId: "conn-1",
    httpStatus: 200,
    // Campos sensíveis que NUNCA devem chegar ao logger:
    accessToken: "at-secret",
    refreshToken: "rt-secret",
    token: "raw-token",
    password: "hunter2",
    secret: "shh",
    client_secret: "cs-secret",
    verify_token: "vt-secret",
    ciphertext: "cipher",
    authTag: "tag",
    code: "oauth-code",
    phoneE164: "+5511999999999",
    email: "user@example.com",
    // Variações por substring:
    userAccessToken: "nested-token",
    appSecret: "nope",
  };

  it("omits every known-sensitive key from the meta", () => {
    const safe = __stripSensitiveForTests({ ...sensitiveMeta });

    // Campos padronizados seguros permanecem.
    expect(safe.provider).toBe("STRAVA");
    expect(safe.operation).toBe("token_refresh");
    expect(safe.status).toBe("refreshed");
    expect(safe.connectionId).toBe("conn-1");
    expect(safe.httpStatus).toBe(200);

    for (const sensitiveKey of [
      "accessToken",
      "refreshToken",
      "token",
      "password",
      "secret",
      "client_secret",
      "verify_token",
      "ciphertext",
      "authTag",
      "code",
      "phoneE164",
      "email",
      "userAccessToken",
      "appSecret",
    ]) {
      expect(safe[sensitiveKey]).toBeUndefined();
    }

    // Nenhum valor sensível deve aparecer na serialização.
    const serialized = JSON.stringify(safe);
    for (const secretValue of [
      "at-secret",
      "rt-secret",
      "hunter2",
      "cs-secret",
      "vt-secret",
      "oauth-code",
      "+5511999999999",
      "user@example.com",
      "nested-token",
    ]) {
      expect(serialized).not.toContain(secretValue);
    }
  });

  it("strips sensitive keys nested inside objects and arrays", () => {
    const safe = __stripSensitiveForTests({
      provider: "STRAVA",
      operation: "sync",
      status: "ok",
      details: { accessToken: "deep-secret", mode: "incremental" },
      items: [{ token: "arr-secret", ok: true }],
    });

    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain("deep-secret");
    expect(serialized).not.toContain("arr-secret");
    // Campos não-sensíveis aninhados são preservados.
    expect(serialized).toContain("incremental");
    expect(serialized).toContain('"ok":true');
  });

  it("forwards only safe fields to the underlying logger", () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logIntegrationEvent("info", "token refreshed", {
      provider: "STRAVA",
      operation: "token_refresh",
      status: "refreshed",
      connectionId: "conn-9",
      accessToken: "must-not-leak",
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logged = infoSpy.mock.calls[0]?.[0] as string;
    expect(logged).toContain("token refreshed");
    expect(logged).toContain("conn-9");
    expect(logged).not.toContain("must-not-leak");

    infoSpy.mockRestore();
  });
});

describe("integration metrics — provider-labeled counters (Req 20.4)", () => {
  beforeEach(() => {
    resetIntegrationMetrics();
  });

  afterEach(() => {
    resetIntegrationMetrics();
  });

  it("increments and reads a labeled counter", () => {
    expect(getIntegrationMetric({ provider: "STRAVA", metric: "request", status: "ok" })).toBe(0);

    incrementIntegrationMetric({ provider: "STRAVA", metric: "request", status: "ok" });
    incrementIntegrationMetric({ provider: "STRAVA", metric: "request", status: "ok" });

    expect(getIntegrationMetric({ provider: "STRAVA", metric: "request", status: "ok" })).toBe(2);
  });

  it("keeps counters separate by provider, metric and status labels", () => {
    incrementIntegrationMetric({ provider: "STRAVA", metric: "request", status: "ok" });
    incrementIntegrationMetric({ provider: "STRAVA", metric: "error", status: "http_error" });
    incrementIntegrationMetric({ provider: "GARMIN", metric: "sync", status: "synced" });
    incrementIntegrationMetric({ provider: "STRAVA", metric: "token_refresh" });

    expect(getIntegrationMetric({ provider: "STRAVA", metric: "request", status: "ok" })).toBe(1);
    expect(getIntegrationMetric({ provider: "STRAVA", metric: "error", status: "http_error" })).toBe(1);
    expect(getIntegrationMetric({ provider: "GARMIN", metric: "sync", status: "synced" })).toBe(1);
    expect(getIntegrationMetric({ provider: "STRAVA", metric: "token_refresh" })).toBe(1);
    // Série não incrementada permanece zero.
    expect(getIntegrationMetric({ provider: "GARMIN", metric: "request", status: "ok" })).toBe(0);
  });

  it("honors the `by` amount", () => {
    incrementIntegrationMetric({ provider: "STRAVA", metric: "webhook", status: "processed", by: 5 });
    expect(getIntegrationMetric({ provider: "STRAVA", metric: "webhook", status: "processed" })).toBe(5);
  });

  it("exposes a deterministic snapshot by provider/metric/status", () => {
    incrementIntegrationMetric({ provider: "STRAVA", metric: "request", status: "ok" });
    incrementIntegrationMetric({ provider: "GARMIN", metric: "sync", status: "synced" });

    const snapshot = getIntegrationMetricsSnapshot();
    expect(snapshot).toEqual([
      { provider: "GARMIN", metric: "sync", status: "synced", count: 1 },
      { provider: "STRAVA", metric: "request", status: "ok", count: 1 },
    ]);
  });

  it("resets all counters", () => {
    incrementIntegrationMetric({ provider: "STRAVA", metric: "request", status: "ok" });
    expect(getIntegrationMetricsSnapshot()).toHaveLength(1);

    resetIntegrationMetrics();

    expect(getIntegrationMetricsSnapshot()).toEqual([]);
    expect(getIntegrationMetric({ provider: "STRAVA", metric: "request", status: "ok" })).toBe(0);
  });
});
