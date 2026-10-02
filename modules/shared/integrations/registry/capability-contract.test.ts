/**
 * SAM-45 — teste de contrato: um módulo registrado não pode declarar no
 * catálogo uma capability executável sem implementar o contrato, nem o
 * contrário. Falha ao registrar um provider pela metade.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ prisma: {} }));

import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import { findCapabilityContractViolations, type ProviderModule } from "@/modules/shared/integrations/contracts";
import { providerRegistry } from "@/modules/shared/integrations/registry";

describe("registry × catálogo (SAM-45)", () => {
  it("todo módulo registrado honra o que o catálogo declara (activities, dailyHealth, webhooks)", () => {
    for (const registered of Object.values(providerRegistry)) {
      const declared = getProviderDefinition(registered.id)?.capabilities ?? {};
      expect(findCapabilityContractViolations(registered, declared), registered.id).toEqual([]);
    }
  });

  it("detecta um módulo que declara saúde diária sem implementar, e um que implementa sem declarar", () => {
    const half: ProviderModule = { id: "POLAR" };
    expect(findCapabilityContractViolations(half, { dailyHealth: true })).toEqual([
      { provider: "POLAR", capability: "dailyHealth", member: "dailyHealth", problem: "declared-without-implementation" },
    ]);
    const undeclared: ProviderModule = {
      id: "POLAR",
      dailyHealth: { id: "POLAR", authType: "OAUTH2", capabilities: {}, getDailyHealth: async () => null },
    };
    expect(findCapabilityContractViolations(undeclared, {})).toEqual([
      { provider: "POLAR", capability: "dailyHealth", member: "dailyHealth", problem: "implemented-without-declaration" },
    ]);
  });
});
