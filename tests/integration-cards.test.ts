import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Importar o catálogo garante o registro do resolver de capabilities e a
// disponibilidade de PROVIDERS/isProviderEnabled usados pelo builder.
import "@/modules/shared/integrations/catalog";
import {
  buildIntegrationCards,
  type UserConnectionSummary,
} from "@/modules/shared/integrations/presentation";

const COMING_SOON = ["POLAR", "COROS", "SUUNTO", "FITBIT"] as const;

function providers(group: { provider: string }[]): string[] {
  return group.map((card) => card.provider).sort();
}

describe("buildIntegrationCards", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("with no connections: GARMIN/STRAVA available, others coming soon", () => {
    const groups = buildIntegrationCards([]);

    expect(groups.connected).toEqual([]);
    expect(providers(groups.available)).toEqual(["GARMIN", "STRAVA"]);
    expect(providers(groups.comingSoon)).toEqual([...COMING_SOON].sort());

    for (const card of groups.available) {
      expect(card.action).toBe("CONNECT");
      expect(card.connected).toBe(false);
    }
    for (const card of groups.comingSoon) {
      expect(card.action).toBe("COMING_SOON");
    }
  });

  it("Garmin connected → MANAGE in connected group; Strava stays available", () => {
    const connections: UserConnectionSummary[] = [
      { provider: "GARMIN", status: "CONNECTED", lastSyncAt: "2024-01-01T00:00:00.000Z" },
    ];

    const groups = buildIntegrationCards(connections);

    expect(providers(groups.connected)).toEqual(["GARMIN"]);
    const garmin = groups.connected.find((card) => card.provider === "GARMIN");
    expect(garmin?.action).toBe("MANAGE");
    expect(garmin?.connected).toBe(true);
    expect(garmin?.status).toBe("CONNECTED");
    expect(garmin?.dates?.lastSyncAt).toBe("2024-01-01T00:00:00.000Z");

    expect(providers(groups.available)).toEqual(["STRAVA"]);
  });

  it("Strava connected + Garmin absent looks natural (Garmin available, not mandatory)", () => {
    const connections: UserConnectionSummary[] = [
      { provider: "STRAVA", status: "CONNECTED" },
    ];

    const groups = buildIntegrationCards(connections);

    expect(providers(groups.connected)).toEqual(["STRAVA"]);
    expect(providers(groups.available)).toEqual(["GARMIN"]);
    const garmin = groups.available.find((card) => card.provider === "GARMIN");
    expect(garmin?.action).toBe("CONNECT");
  });

  it("RECONNECT_REQUIRED status yields RECONNECT action", () => {
    const groups = buildIntegrationCards([
      { provider: "GARMIN", status: "RECONNECT_REQUIRED" },
    ]);

    const garmin = groups.connected.find((card) => card.provider === "GARMIN");
    expect(garmin?.action).toBe("RECONNECT");
    expect(garmin?.connected).toBe(true);
  });

  it("DISCONNECTED status is treated as not connected (offers CONNECT)", () => {
    const groups = buildIntegrationCards([
      { provider: "GARMIN", status: "DISCONNECTED" },
    ]);

    expect(providers(groups.connected)).toEqual([]);
    const garmin = groups.available.find((card) => card.provider === "GARMIN");
    expect(garmin?.action).toBe("CONNECT");
  });

  it("respects isProviderEnabled: flag-disabled AVAILABLE provider becomes coming soon (no connect)", () => {
    vi.stubEnv("INTEGRATION_STRAVA_ENABLED", "false");

    const groups = buildIntegrationCards([]);

    expect(providers(groups.available)).toEqual(["GARMIN"]);
    const strava = groups.comingSoon.find((card) => card.provider === "STRAVA");
    expect(strava?.action).toBe("COMING_SOON");
  });

  it("keeps a flag-disabled provider manageable when still connected", () => {
    vi.stubEnv("INTEGRATION_STRAVA_ENABLED", "false");

    const groups = buildIntegrationCards([
      { provider: "STRAVA", status: "CONNECTED" },
    ]);

    const strava = groups.connected.find((card) => card.provider === "STRAVA");
    expect(strava?.action).toBe("MANAGE");
    expect(groups.comingSoon.some((card) => card.provider === "STRAVA")).toBe(false);
  });

  it("ignores connections for providers absent from the catalog (e.g. APPLE)", () => {
    const groups = buildIntegrationCards([
      { provider: "APPLE", status: "CONNECTED" },
    ]);

    expect(providers(groups.connected)).toEqual([]);
    expect(providers(groups.available)).toEqual(["GARMIN", "STRAVA"]);
  });
});
