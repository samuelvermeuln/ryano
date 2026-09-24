/**
 * TM067 (RF-205) — getMarketplacePlatformFeeBps: parametrizável via env,
 * nunca uma constante embutida no código de cálculo do ledger.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ env: { MARKETPLACE_PLATFORM_FEE_BPS: undefined as string | undefined } }));
vi.mock("@/server/env", () => ({ env: mocks.env }));

import { getMarketplacePlatformFeeBps, DEFAULT_MARKETPLACE_PLATFORM_FEE_BPS } from "@/modules/school/config/marketplace-fee-settings";

beforeEach(() => {
  mocks.env.MARKETPLACE_PLATFORM_FEE_BPS = undefined;
});

describe("getMarketplacePlatformFeeBps [TM067]", () => {
  it("sem env configurada, usa o default documentado", () => {
    expect(getMarketplacePlatformFeeBps()).toBe(DEFAULT_MARKETPLACE_PLATFORM_FEE_BPS);
  });

  it("lê o valor da env quando configurada — mudar a taxa não exige deploy de código", () => {
    mocks.env.MARKETPLACE_PLATFORM_FEE_BPS = "1200";
    expect(getMarketplacePlatformFeeBps()).toBe(1200);
  });

  it("valor fora de [0, 10000] cai para o default em vez de produzir uma taxa inválida", () => {
    mocks.env.MARKETPLACE_PLATFORM_FEE_BPS = "99999";
    expect(getMarketplacePlatformFeeBps()).toBe(DEFAULT_MARKETPLACE_PLATFORM_FEE_BPS);
  });

  it("valor não numérico cai para o default", () => {
    mocks.env.MARKETPLACE_PLATFORM_FEE_BPS = "quinze por cento";
    expect(getMarketplacePlatformFeeBps()).toBe(DEFAULT_MARKETPLACE_PLATFORM_FEE_BPS);
  });
});
