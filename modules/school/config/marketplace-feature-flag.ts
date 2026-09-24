import { env } from "@/server/env";
import { isSchoolModuleEnabled } from "./feature-flag";

/**
 * TM016 (Q8) — resolves whether the marketplace should be active.
 *
 * A DEDICATED flag, not a reuse of `SCHOOL_MODULE_ENABLED`: a marketplace
 * buyer can be an athlete with no school affiliation (coachId-owned
 * products), so the marketplace must be independently controllable — but it
 * still requires the school module itself to be enabled, since its code and
 * data (CoachProfile, WorkoutAssignment, …) live there (see marketplace.yaml).
 *
 * Same precedence as `isSchoolModuleEnabled` (explicit false kill-switch >
 * explicit true > dev/staging auto-enable > off in production).
 */
export function isMarketplaceEnabled(): boolean {
  if (!isSchoolModuleEnabled()) return false;
  if (env.MARKETPLACE_ENABLED === "false") return false;
  if (env.MARKETPLACE_ENABLED === "true") return true;
  return isSchoolModuleEnabled();
}

export function assertMarketplaceEnabled(): void {
  if (!isMarketplaceEnabled()) throw new Error("MARKETPLACE_DISABLED");
}
