import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Importar o catálogo tem o efeito colateral de registrar o resolver de
// capabilities do core (setProviderCapabilitiesResolver). É essencial que o
// catálogo seja importado ANTES de exercitar hasCapability/getUserCapabilities.
import {
  PROVIDERS,
  getProviderDefinition,
  isProviderEnabled,
} from "@/modules/shared/integrations/catalog";
import {
  getUserCapabilities,
  hasCapability,
  userHasCapability,
} from "@/modules/shared/integrations/capabilities";
import {
  ProviderPolicyViolationError,
  assertPolicy,
  isPolicyAllowed,
} from "@/modules/shared/integrations/policy";
import type { ProviderId } from "@/modules/shared/integrations/types";
import {
  RYVANO_SPORT_TYPES,
  type RyvanoSportType,
  getRyvanoSportLabel,
  isRyvanoSportType,
  mapRyvanoSportToLegacy,
  mapRyvanoSportToReportTheme,
} from "@/modules/shared/activities/sport-types";
import type { SportIconName } from "@/lib/sports";

const AVAILABLE_PROVIDERS: readonly ProviderId[] = ["GARMIN", "STRAVA"];
const COMING_SOON_PROVIDERS: readonly ProviderId[] = [
  "POLAR",
  "COROS",
  "SUUNTO",
  "FITBIT",
];

const VALID_LEGACY_SPORTS: readonly SportIconName[] = [
  "swim",
  "bike",
  "run",
  "triathlon",
  "multisport",
  "walking",
  "strength",
  "default",
];

describe("catalog", () => {
  it("lists all six known providers exactly once", () => {
    const ids = PROVIDERS.map((provider) => provider.id).sort();
    expect(ids).toEqual(
      ["COROS", "FITBIT", "GARMIN", "POLAR", "STRAVA", "SUUNTO"].sort(),
    );
    // Sem duplicatas.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks GARMIN and STRAVA as AVAILABLE", () => {
    for (const id of AVAILABLE_PROVIDERS) {
      expect(getProviderDefinition(id)?.availability).toBe("AVAILABLE");
    }
  });

  it("marks POLAR/COROS/SUUNTO/FITBIT as COMING_SOON without declared capabilities", () => {
    for (const id of COMING_SOON_PROVIDERS) {
      const definition = getProviderDefinition(id);
      expect(definition?.availability).toBe("COMING_SOON");
      expect(definition?.capabilities).toEqual({});
    }
  });

  it("getProviderDefinition returns the definition for a known provider", () => {
    const garmin = getProviderDefinition("GARMIN");
    expect(garmin?.id).toBe("GARMIN");
    expect(garmin?.name).toBe("Garmin");
    expect(garmin?.authType).toBe("CREDENTIALS");
  });
});

describe("isProviderEnabled", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables AVAILABLE providers when the feature flag is absent", () => {
    vi.stubEnv("INTEGRATION_GARMIN_ENABLED", "");
    vi.stubEnv("INTEGRATION_STRAVA_ENABLED", "");
    expect(isProviderEnabled("GARMIN")).toBe(true);
    expect(isProviderEnabled("STRAVA")).toBe(true);
  });

  it("keeps AVAILABLE providers enabled for non-'false' flag values", () => {
    vi.stubEnv("INTEGRATION_GARMIN_ENABLED", "true");
    expect(isProviderEnabled("GARMIN")).toBe(true);

    vi.stubEnv("INTEGRATION_GARMIN_ENABLED", "1");
    expect(isProviderEnabled("GARMIN")).toBe(true);
  });

  it("disables an AVAILABLE provider only when the flag is explicitly 'false'", () => {
    vi.stubEnv("INTEGRATION_GARMIN_ENABLED", "false");
    expect(isProviderEnabled("GARMIN")).toBe(false);

    // Case-insensitive e tolerante a espaços.
    vi.stubEnv("INTEGRATION_STRAVA_ENABLED", "  FALSE  ");
    expect(isProviderEnabled("STRAVA")).toBe(false);
  });

  it("never enables COMING_SOON providers, even with the flag enabled", () => {
    for (const id of COMING_SOON_PROVIDERS) {
      vi.stubEnv(`INTEGRATION_${id}_ENABLED`, "true");
      expect(isProviderEnabled(id)).toBe(false);
    }
  });
});

describe("capabilities (resolver wired by importing the catalog)", () => {
  it("hasCapability reflects the catalog values for GARMIN", () => {
    expect(hasCapability("GARMIN", "activities")).toBe(true);
    expect(hasCapability("GARMIN", "recovery")).toBe(true);
    expect(hasCapability("GARMIN", "sleep")).toBe(true);
    expect(hasCapability("GARMIN", "hrv")).toBe(true);
    // Garmin não recebe webhooks no comportamento atual.
    expect(hasCapability("GARMIN", "webhooks")).toBe(false);
  });

  it("hasCapability reflects the catalog values for STRAVA", () => {
    expect(hasCapability("STRAVA", "activities")).toBe(true);
    expect(hasCapability("STRAVA", "streams")).toBe(true);
    expect(hasCapability("STRAVA", "webhooks")).toBe(true);
    expect(hasCapability("STRAVA", "oauth")).toBe(true);
    // Strava não fornece dados fisiológicos.
    expect(hasCapability("STRAVA", "recovery")).toBe(false);
    expect(hasCapability("STRAVA", "sleep")).toBe(false);
  });

  // Requisito 8.1: a capability de zonas de FC do Strava é satisfeita por
  // cálculo interno a partir do stream de FC — o core não distingue origem
  // nativa de origem calculada (Requisito 8.2).
  it("declares heartRateZones for STRAVA (satisfied by internal computation)", () => {
    expect(hasCapability("STRAVA", "heartRateZones")).toBe(true);
    expect(getProviderDefinition("STRAVA")?.capabilities.heartRateZones).toBe(
      true,
    );
  });

  // Requisito 8.3: zonas de potência permanecem fora de escopo para o Strava —
  // a capability deve ficar ausente (ou explicitamente `false`), nunca `true`.
  it("does not declare powerZones for STRAVA", () => {
    expect(hasCapability("STRAVA", "powerZones")).toBe(false);

    const declared = getProviderDefinition("STRAVA")?.capabilities.powerZones;
    expect(declared === undefined || declared === false).toBe(true);

    // Um usuário conectado apenas ao Strava não deve ganhar a capability.
    expect(getUserCapabilities(["STRAVA"]).powerZones).toBeUndefined();
    expect(userHasCapability(["STRAVA"], "powerZones")).toBe(false);
  });

  it("reports no capabilities for COMING_SOON providers", () => {
    for (const id of COMING_SOON_PROVIDERS) {
      expect(hasCapability(id, "activities")).toBe(false);
      expect(hasCapability(id, "oauth")).toBe(false);
    }
  });

  it("getUserCapabilities returns the union across connected providers", () => {
    const union = getUserCapabilities(["GARMIN", "STRAVA"]);
    // Union: recovery (Garmin) + streams (Strava) devem ambos estar presentes.
    expect(union.recovery).toBe(true);
    expect(union.streams).toBe(true);
    expect(union.activities).toBe(true);
    expect(union.webhooks).toBe(true);
    // Capabilities que nenhum provider fornece não aparecem.
    expect(union.powerZones).toBe(true); // Garmin fornece
  });

  it("getUserCapabilities with no connected providers is empty", () => {
    expect(getUserCapabilities([])).toEqual({});
  });

  it("getUserCapabilities only exposes capabilities from connected providers", () => {
    const stravaOnly = getUserCapabilities(["STRAVA"]);
    expect(stravaOnly.recovery).toBeUndefined();
    expect(stravaOnly.streams).toBe(true);
  });

  it("userHasCapability is true when at least one connected provider provides it", () => {
    expect(userHasCapability(["GARMIN", "STRAVA"], "recovery")).toBe(true);
    expect(userHasCapability(["STRAVA"], "recovery")).toBe(false);
    expect(userHasCapability(["STRAVA"], "streams")).toBe(true);
    expect(userHasCapability([], "activities")).toBe(false);
  });
});

describe("policy gate", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows 'persist' for GARMIN and STRAVA", () => {
    for (const id of AVAILABLE_PROVIDERS) {
      expect(() => assertPolicy(id, "persist")).not.toThrow();
      expect(isPolicyAllowed(id, "persist")).toBe(true);
    }
  });

  it("blocks 'combine' by default (flag absent)", () => {
    expect(() => assertPolicy("STRAVA", "combine")).toThrow(
      ProviderPolicyViolationError,
    );
    expect(isPolicyAllowed("STRAVA", "combine")).toBe(false);
  });

  it("keeps 'combine' blocked even when the reconciliation flag is enabled (policy denies)", () => {
    vi.stubEnv("STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED", "true");
    // allowCrossProviderCombination é false para GARMIN/STRAVA, então mesmo com
    // o flag ligado a combinação permanece bloqueada.
    expect(() => assertPolicy("STRAVA", "combine")).toThrow(
      ProviderPolicyViolationError,
    );
    expect(() => assertPolicy("GARMIN", "combine")).toThrow(
      ProviderPolicyViolationError,
    );
    expect(isPolicyAllowed("STRAVA", "combine")).toBe(false);
  });

  it("carries the provider and action on the thrown error", () => {
    try {
      // "combine" lança por padrão (flag de reconciliação desligado).
      assertPolicy("GARMIN", "combine");
      expect.unreachable("assertPolicy should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderPolicyViolationError);
      const violation = error as ProviderPolicyViolationError;
      expect(violation.providerId).toBe("GARMIN");
      expect(violation.action).toBe("combine");
    }
  });

  it("denies every action for not-yet-implemented providers", () => {
    for (const id of COMING_SOON_PROVIDERS) {
      expect(() => assertPolicy(id, "persist")).toThrow(
        ProviderPolicyViolationError,
      );
      expect(() => assertPolicy(id, "combine")).toThrow(
        ProviderPolicyViolationError,
      );
    }
  });
});

describe("sport-types taxonomy", () => {
  it("maps every RyvanoSportType to a valid legacy SportIconName", () => {
    for (const sport of RYVANO_SPORT_TYPES) {
      const legacy = mapRyvanoSportToLegacy(sport);
      expect(VALID_LEGACY_SPORTS).toContain(legacy);
    }
  });

  it("maps every RyvanoSportType to a valid ReportThemeSport (identity)", () => {
    for (const sport of RYVANO_SPORT_TYPES) {
      // ReportThemeSport compartilha o mesmo espaço de valores: identidade.
      expect(mapRyvanoSportToReportTheme(sport)).toBe(sport);
    }
  });

  it("produces a non-empty label for every RyvanoSportType", () => {
    for (const sport of RYVANO_SPORT_TYPES) {
      const label = getRyvanoSportLabel(sport);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("spot-checks specific legacy mappings", () => {
    expect(mapRyvanoSportToLegacy("open-water")).toBe("swim");
    expect(mapRyvanoSportToLegacy("mtb")).toBe("bike");
    expect(mapRyvanoSportToLegacy("trail-run")).toBe("run");
    expect(mapRyvanoSportToLegacy("crossfit")).toBe("strength");
    expect(mapRyvanoSportToLegacy("hiking")).toBe("walking");
    expect(mapRyvanoSportToLegacy("duathlon")).toBe("multisport");
    expect(mapRyvanoSportToLegacy("football")).toBe("default");
    expect(mapRyvanoSportToLegacy("default")).toBe("default");
  });

  it("isRyvanoSportType accepts canonical values and rejects others", () => {
    expect(isRyvanoSportType("run")).toBe(true);
    expect(isRyvanoSportType("open-water")).toBe(true);
    expect(isRyvanoSportType("not-a-sport")).toBe(false);
    expect(isRyvanoSportType("")).toBe(false);
    expect(isRyvanoSportType(null)).toBe(false);
    expect(isRyvanoSportType(42)).toBe(false);
    expect(isRyvanoSportType(undefined)).toBe(false);
  });

  it("keeps RYVANO_SPORT_TYPES free of duplicates", () => {
    const set = new Set<RyvanoSportType>(RYVANO_SPORT_TYPES);
    expect(set.size).toBe(RYVANO_SPORT_TYPES.length);
  });
});
