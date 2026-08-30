import { describe, expect, it } from "vitest";

import {
  ProviderPolicyViolationError,
  assertAiProcessingAllowed,
  assertAiProcessingAllowedForProviders,
  assertThirdPartyDisclosureAllowed,
  assertThirdPartyDisclosureAllowedForProviders,
  isPolicyAllowed,
} from "@/modules/shared/integrations/policy";
import type { ProviderId } from "@/modules/shared/integrations/types";

// Providers atualmente implementados (AVAILABLE). O bloqueio de IA e de
// divulgação a terceiros vale para ambos enquanto a política proibir.
const AVAILABLE_PROVIDERS: readonly ProviderId[] = ["GARMIN", "STRAVA"];

describe("policy guards — bloqueio de IA (Req 15.4/15.5)", () => {
  it("assertAiProcessingAllowed lança para GARMIN e STRAVA", () => {
    for (const id of AVAILABLE_PROVIDERS) {
      expect(() => assertAiProcessingAllowed(id)).toThrow(
        ProviderPolicyViolationError,
      );
    }
  });

  it("isPolicyAllowed(id, 'ai') é false para GARMIN e STRAVA", () => {
    for (const id of AVAILABLE_PROVIDERS) {
      expect(isPolicyAllowed(id, "ai")).toBe(false);
    }
  });

  it("o erro de IA carrega providerId e action (observabilidade, Req 20.1)", () => {
    try {
      assertAiProcessingAllowed("STRAVA");
      expect.unreachable("assertAiProcessingAllowed deveria ter lançado");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderPolicyViolationError);
      const violation = error as ProviderPolicyViolationError;
      expect(violation.providerId).toBe("STRAVA");
      expect(violation.action).toBe("ai");
      // A mensagem não deve conter dados/segredos — apenas provider + ação.
      expect(violation.message).toContain("STRAVA");
      expect(violation.message).toContain("ai");
    }
  });

  it("a variante multi-provider lança se QUALQUER provider proibir IA", () => {
    expect(() =>
      assertAiProcessingAllowedForProviders(["GARMIN", "STRAVA"]),
    ).toThrow(ProviderPolicyViolationError);

    // Basta um provider proibido no conjunto para bloquear tudo.
    expect(() =>
      assertAiProcessingAllowedForProviders(["STRAVA"]),
    ).toThrow(ProviderPolicyViolationError);
  });

  it("a variante multi-provider não lança para um conjunto vazio", () => {
    expect(() => assertAiProcessingAllowedForProviders([])).not.toThrow();
  });
});

describe("policy guards — bloqueio de compartilhamento com terceiros (Req 15.4/15.5)", () => {
  it("assertThirdPartyDisclosureAllowed lança para GARMIN e STRAVA", () => {
    for (const id of AVAILABLE_PROVIDERS) {
      expect(() => assertThirdPartyDisclosureAllowed(id)).toThrow(
        ProviderPolicyViolationError,
      );
    }
  });

  it("isPolicyAllowed(id, 'share') é false para GARMIN e STRAVA", () => {
    for (const id of AVAILABLE_PROVIDERS) {
      expect(isPolicyAllowed(id, "share")).toBe(false);
    }
  });

  it("o erro de compartilhamento carrega providerId e action (Req 20.1)", () => {
    try {
      assertThirdPartyDisclosureAllowed("GARMIN");
      expect.unreachable(
        "assertThirdPartyDisclosureAllowed deveria ter lançado",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderPolicyViolationError);
      const violation = error as ProviderPolicyViolationError;
      expect(violation.providerId).toBe("GARMIN");
      expect(violation.action).toBe("share");
    }
  });

  it("a variante multi-provider lança se QUALQUER provider proibir divulgação", () => {
    expect(() =>
      assertThirdPartyDisclosureAllowedForProviders(["GARMIN", "STRAVA"]),
    ).toThrow(ProviderPolicyViolationError);
  });

  it("a variante multi-provider não lança para um conjunto vazio", () => {
    expect(() =>
      assertThirdPartyDisclosureAllowedForProviders([]),
    ).not.toThrow();
  });
});
