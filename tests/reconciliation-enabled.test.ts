import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocka o Policy Gate para exercitar o CAMINHO HABILITADO da reconciliação sem
// depender de uma política que permita combinação (nenhum provider real
// permite hoje). O `ProviderPolicyViolationError` real é preservado para que o
// `instanceof` dentro de reconcileActivities continue válido.
vi.mock("@/modules/shared/integrations/policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/shared/integrations/policy")>();
  return {
    ...actual,
    isCrossProviderCombinationFlagEnabled: vi.fn(() => true),
    assertPolicy: vi.fn(() => undefined),
  };
});

import type { NormalizedActivity } from "@/modules/shared/activities/contracts";
import {
  isReconciliationAllowed,
  reconcileActivities,
} from "@/modules/shared/activities/reconciliation";
import {
  assertPolicy,
  isCrossProviderCombinationFlagEnabled,
} from "@/modules/shared/integrations/policy";

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

describe("reconciliation — enabled path (flag + policy allow)", () => {
  beforeEach(() => {
    vi.mocked(isCrossProviderCombinationFlagEnabled).mockReturnValue(true);
    vi.mocked(assertPolicy).mockImplementation(() => undefined);
  });

  it("is allowed when both the flag and the policy permit combination", () => {
    expect(isReconciliationAllowed(["GARMIN", "STRAVA"])).toBe(true);
  });

  it("produces match candidates for same-sport activities within the time window", () => {
    const primary = activity({
      source: "GARMIN",
      externalId: "g-1",
      startedAt: new Date("2025-02-10T06:00:00Z"),
      distanceMeters: 10000,
    });
    const candidate = activity({
      source: "STRAVA",
      externalId: "s-1",
      startedAt: new Date("2025-02-10T06:01:00Z"), // 60s depois
      distanceMeters: 10050,
    });

    const result = reconcileActivities({
      primaryProvider: "GARMIN",
      candidateProvider: "STRAVA",
      primaryActivities: [primary],
      candidateActivities: [candidate],
    });

    expect(result.enabled).toBe(true);
    expect(result.candidates).toHaveLength(1);

    const [match] = result.candidates;
    expect(match.timeDeltaSeconds).toBe(60);
    expect(match.matchScore).toBeGreaterThan(0);
    expect(match.matchScore).toBeLessThanOrEqual(1);

    // As comparações de métrica preservam a proveniência de CADA provider e não
    // fazem merge (dois valores distintos coexistem — Req 16.2, 16.5).
    const distance = match.metricComparisons.find((c) => c.metric === "distanceMeters");
    expect(distance?.values.map((v) => v.provider).sort()).toEqual(["GARMIN", "STRAVA"]);
    expect(distance?.values.map((v) => v.value).sort()).toEqual([10000, 10050]);
    expect(distance?.divergent).toBe(false); // 50m < 100m de tolerância
  });

  it("does not match activities of different sports", () => {
    const result = reconcileActivities({
      primaryProvider: "GARMIN",
      candidateProvider: "STRAVA",
      primaryActivities: [activity({ source: "GARMIN", externalId: "g-1", sportType: "run" })],
      candidateActivities: [activity({ source: "STRAVA", externalId: "s-1", sportType: "bike" })],
    });

    expect(result.enabled).toBe(true);
    expect(result.candidates).toEqual([]);
  });

  it("does not match activities outside the time window", () => {
    const result = reconcileActivities({
      primaryProvider: "GARMIN",
      candidateProvider: "STRAVA",
      primaryActivities: [
        activity({ source: "GARMIN", externalId: "g-1", startedAt: new Date("2025-02-10T06:00:00Z") }),
      ],
      candidateActivities: [
        activity({ source: "STRAVA", externalId: "s-1", startedAt: new Date("2025-02-10T07:00:00Z") }),
      ],
    });

    expect(result.enabled).toBe(true);
    expect(result.candidates).toEqual([]);
  });

  it("flags divergent metrics beyond tolerance without merging them", () => {
    const result = reconcileActivities({
      primaryProvider: "GARMIN",
      candidateProvider: "STRAVA",
      primaryActivities: [activity({ source: "GARMIN", externalId: "g-1", distanceMeters: 10000 })],
      candidateActivities: [activity({ source: "STRAVA", externalId: "s-1", distanceMeters: 12000 })],
    });

    const distance = result.candidates[0]?.metricComparisons.find(
      (c) => c.metric === "distanceMeters",
    );
    expect(distance?.divergent).toBe(true);
    // Ambos os valores permanecem disponíveis, sem sobrescrita.
    expect(distance?.values).toHaveLength(2);
  });
});
