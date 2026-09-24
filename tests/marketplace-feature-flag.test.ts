/**
 * TM016 (Q8) — MARKETPLACE_ENABLED é uma flag própria, não um reaproveitamento
 * de SCHOOL_MODULE_ENABLED (um comprador pode não ter nenhum vínculo escolar).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { SCHOOL_MODULE_ENABLED: undefined as string | undefined, MARKETPLACE_ENABLED: undefined as string | undefined },
}));
vi.mock("@/server/env", () => ({ env: mocks.env }));

describe("isMarketplaceEnabled [TM016]", () => {
  beforeEach(() => {
    mocks.env.SCHOOL_MODULE_ENABLED = undefined;
    mocks.env.MARKETPLACE_ENABLED = undefined;
    vi.stubEnv("NODE_ENV", "test"); // non-production -> isSchoolModuleEnabled() auto-true
  });

  it("desligada quando o módulo escola está desligado, mesmo com MARKETPLACE_ENABLED=true", async () => {
    mocks.env.SCHOOL_MODULE_ENABLED = "false";
    mocks.env.MARKETPLACE_ENABLED = "true";
    const { isMarketplaceEnabled } = await import("@/modules/school/config/marketplace-feature-flag");
    expect(isMarketplaceEnabled()).toBe(false);
  });

  it("MARKETPLACE_ENABLED=false é kill-switch mesmo com escola ligada", async () => {
    mocks.env.SCHOOL_MODULE_ENABLED = "true";
    mocks.env.MARKETPLACE_ENABLED = "false";
    const { isMarketplaceEnabled } = await import("@/modules/school/config/marketplace-feature-flag");
    expect(isMarketplaceEnabled()).toBe(false);
  });

  it("MARKETPLACE_ENABLED=true liga explicitamente, com escola ligada", async () => {
    mocks.env.SCHOOL_MODULE_ENABLED = "true";
    mocks.env.MARKETPLACE_ENABLED = "true";
    const { isMarketplaceEnabled } = await import("@/modules/school/config/marketplace-feature-flag");
    expect(isMarketplaceEnabled()).toBe(true);
  });

  it("sem nenhuma flag configurada, segue o mesmo auto-enable de dev/staging da escola", async () => {
    const { isMarketplaceEnabled } = await import("@/modules/school/config/marketplace-feature-flag");
    expect(isMarketplaceEnabled()).toBe(true); // NODE_ENV=test -> isDevOrStaging() true
  });

  it("assertMarketplaceEnabled lança MARKETPLACE_DISABLED quando desligado", async () => {
    mocks.env.SCHOOL_MODULE_ENABLED = "false";
    const { assertMarketplaceEnabled } = await import("@/modules/school/config/marketplace-feature-flag");
    expect(() => assertMarketplaceEnabled()).toThrow("MARKETPLACE_DISABLED");
  });
});
