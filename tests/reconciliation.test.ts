import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Importar o catálogo garante o resolver de capabilities/policies do core.
import "@/modules/shared/integrations/catalog";
import type { NormalizedActivity } from "@/modules/shared/activities/contracts";
import {
  isReconciliationAllowed,
  reconcileActivities,
} from "@/modules/shared/activities/reconciliation";

function activity(overrides: Partial<NormalizedActivity>): NormalizedActivity {
  return {
    source: "GARMIN",
    externalId: "a-1",
    sportType: "run",
    providerSportType: "running",
    startedAt: new Date("2025-02-10T06:00:00Z"),
    distanceMeters: 10000,
    durationSeconds: 3000,
    averageHeartRate: 150,
    ...overrides,
  };
}

describe("reconciliation gating — disabled by default", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a no-op when the reconciliation flag is absent (default)", () => {
    const result = reconcileActivities({
      primaryProvider: "GARMIN",
      candidateProvider: "STRAVA",
      primaryActivities: [activity({ source: "GARMIN", externalId: "g-1" })],
      candidateActivities: [activity({ source: "STRAVA", externalId: "s-1" })],
    });

    expect(result.enabled).toBe(false);
    expect(result.candidates).toEqual([]);
    expect(isReconciliationAllowed(["GARMIN", "STRAVA"])).toBe(false);
  });

  it("stays a no-op even with the flag on because assertPolicy blocks 'combine'", () => {
    // Mesmo com o flag ligado, a política de GARMIN/STRAVA nega combinação
    // (allowCrossProviderCombination === false), então assertPolicy("combine")
    // bloqueia e a reconciliação permanece desabilitada (Req 15.6, 16.x).
    vi.stubEnv("STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED", "true");

    const result = reconcileActivities({
      primaryProvider: "GARMIN",
      candidateProvider: "STRAVA",
      primaryActivities: [activity({ source: "GARMIN", externalId: "g-1" })],
      candidateActivities: [activity({ source: "STRAVA", externalId: "s-1" })],
    });

    expect(result.enabled).toBe(false);
    expect(result.candidates).toEqual([]);
    expect(isReconciliationAllowed(["GARMIN", "STRAVA"])).toBe(false);
  });

  it("never mutates the original activities (no automatic merge)", () => {
    const primary = activity({ source: "GARMIN", externalId: "g-1", distanceMeters: 10000 });
    const candidate = activity({ source: "STRAVA", externalId: "s-1", distanceMeters: 10050 });
    const primarySnapshot = { ...primary };
    const candidateSnapshot = { ...candidate };

    reconcileActivities({
      primaryProvider: "GARMIN",
      candidateProvider: "STRAVA",
      primaryActivities: [primary],
      candidateActivities: [candidate],
    });

    expect(primary).toEqual(primarySnapshot);
    expect(candidate).toEqual(candidateSnapshot);
  });
});
