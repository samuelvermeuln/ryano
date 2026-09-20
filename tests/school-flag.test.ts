import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

// --- Explicit flag always wins over environment bypass ---

it("SCHOOL_MODULE_ENABLED=false is a kill-switch even in dev/staging", async () => {
  vi.stubEnv("SCHOOL_MODULE_ENABLED", "false");
  // NODE_ENV is "test" here (not "production"), so bypass would normally fire —
  // but explicit false must override it.
  const flag = await import("@/modules/school/config/feature-flag");
  expect(flag.isSchoolModuleEnabled()).toBe(false);
  expect(() => flag.assertSchoolModuleEnabled()).toThrow("SCHOOL_MODULE_DISABLED");
});

it("SCHOOL_MODULE_ENABLED=true enables the module regardless of environment", async () => {
  vi.stubEnv("SCHOOL_MODULE_ENABLED", "true");
  const flag = await import("@/modules/school/config/feature-flag");
  expect(flag.isSchoolModuleEnabled()).toBe(true);
  expect(() => flag.assertSchoolModuleEnabled()).not.toThrow();
});

// --- Bypass: auto-enable when flag is unset in non-production environments ---

it("auto-enables when flag is unset in dev/test (NODE_ENV !== production)", async () => {
  // NODE_ENV=test (Vitest default) → bypass fires
  vi.stubEnv("SCHOOL_MODULE_ENABLED", undefined);
  const flag = await import("@/modules/school/config/feature-flag");
  expect(flag.isSchoolModuleEnabled()).toBe(true);
});

it("stays disabled when flag is unset in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("SCHOOL_MODULE_ENABLED", undefined);
  const flag = await import("@/modules/school/config/feature-flag");
  expect(flag.isSchoolModuleEnabled()).toBe(false);
  expect(() => flag.assertSchoolModuleEnabled()).toThrow("SCHOOL_MODULE_DISABLED");
});

it("auto-enables on Vercel preview (staging) even when NODE_ENV=production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("SCHOOL_MODULE_ENABLED", undefined);
  const flag = await import("@/modules/school/config/feature-flag");
  expect(flag.isSchoolModuleEnabled()).toBe(true);
});

// --- Malformed config ---

it("rejects malformed configuration rather than enabling by truthiness", async () => {
  vi.stubEnv("SCHOOL_MODULE_ENABLED", "yes");
  await expect(import("@/modules/school/config/feature-flag")).rejects.toThrow();
});
