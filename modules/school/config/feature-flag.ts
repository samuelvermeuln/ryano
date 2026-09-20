import { env } from "@/server/env";

/**
 * Resolves whether the school module should be active.
 *
 * Priority (highest to lowest):
 *  1. `SCHOOL_MODULE_ENABLED=false` — always disabled (explicit opt-out / canary kill-switch).
 *  2. `SCHOOL_MODULE_ENABLED=true`  — always enabled (explicit opt-in).
 *  3. Not set + dev or staging env   — auto-enabled (bypass so engineers don't need the flag).
 *  4. Not set + production           — disabled (safe default).
 *
 * "dev" = NODE_ENV !== "production"; "staging" = Vercel VERCEL_ENV=preview.
 */
function isDevOrStaging(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  // Vercel sets VERCEL_ENV="preview" for staging / preview deployments
  if (process.env.VERCEL_ENV === "preview") return true;
  return false;
}

export function isSchoolModuleEnabled(): boolean {
  // Explicit false is a kill-switch that wins over any env bypass.
  if (env.SCHOOL_MODULE_ENABLED === "false") return false;
  // Explicit true always enables.
  if (env.SCHOOL_MODULE_ENABLED === "true") return true;
  // Not configured: auto-enable in dev/staging, stay off in production.
  return isDevOrStaging();
}

export function assertSchoolModuleEnabled(): void {
  if (!isSchoolModuleEnabled()) throw new Error("SCHOOL_MODULE_DISABLED");
}
