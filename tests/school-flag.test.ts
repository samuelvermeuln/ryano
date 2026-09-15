import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("defaults school off and denies entry without explicit enablement", async () => {
  vi.stubEnv("SCHOOL_MODULE_ENABLED", undefined);
  const flag = await import("@/modules/school/config/feature-flag");
  expect(flag.isSchoolModuleEnabled()).toBe(false);
  expect(() => flag.assertSchoolModuleEnabled()).toThrow("SCHOOL_MODULE_DISABLED");
});

it.each(["true", "false"])("honors explicit %s", async (value) => {
  vi.stubEnv("SCHOOL_MODULE_ENABLED", value);
  const flag = await import("@/modules/school/config/feature-flag");
  expect(flag.isSchoolModuleEnabled()).toBe(value === "true");
  if (value === "true") expect(() => flag.assertSchoolModuleEnabled()).not.toThrow();
  else expect(() => flag.assertSchoolModuleEnabled()).toThrow("SCHOOL_MODULE_DISABLED");
});

it("rejects malformed configuration rather than enabling by truthiness", async () => {
  vi.stubEnv("SCHOOL_MODULE_ENABLED", "yes");
  await expect(import("@/modules/school/config/feature-flag")).rejects.toThrow();
});
