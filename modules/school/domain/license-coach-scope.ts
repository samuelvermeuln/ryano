import { z } from "zod";
import { isRyvanoSportType } from "@/modules/shared/activities/sport-types";

/**
 * TM072/TM085 (RF-301/RF-305) — the shape of `LicenseCoachEngagement.scope`
 * (Json column, migration 0041). Interpreted by application code, not the
 * database (schema comment on the model).
 *
 *   - `{ full: true }` — the coach may read/adapt every session of the plan.
 *   - `{ sportTypes: [...] }` — a partial grant, scoped to sessions of those
 *     canonical modalities only (RF-305 "por modalidade com escopo parcial").
 *
 * No duration/expiry field exists on the model by design (TM008) — same
 * "permanent until explicitly ended" default already established for
 * `TrainingLicense` itself (Q1, STATUS.md §7): the engagement lasts until
 * `RevokeCoachEngagement` (TM076) ends it, not a timer. RF-301's "duração...
 * visíveis antes do convite" requirement is satisfied by the UI stating this
 * plainly before the invite is sent, not by a stored expiry.
 */
export const licenseCoachEngagementScopeSchema = z.union([
  z.strictObject({ full: z.literal(true) }),
  z.strictObject({
    sportTypes: z.array(z.string().refine(isRyvanoSportType, { message: "sportTypes deve usar RyvanoSportType canônico" })).min(1),
  }),
]);
export type LicenseCoachEngagementScope = z.infer<typeof licenseCoachEngagementScopeSchema>;

export function isFullScope(scope: LicenseCoachEngagementScope): scope is { full: true } {
  return "full" in scope && scope.full === true;
}

/**
 * RF-305 — true when two open (PENDING/ACTIVE) engagements on the SAME
 * license would let both coaches touch the same session/modality without an
 * explicit precedence rule. A full-scope engagement conflicts with anything;
 * two partial-scope engagements conflict only when their sport types
 * overlap — e.g. a swim-only coach and a run-only coach on the same
 * multimodal license do NOT conflict (task-list.md TM085 criterio).
 */
export function scopesConflict(a: LicenseCoachEngagementScope, b: LicenseCoachEngagementScope): boolean {
  if (isFullScope(a) || isFullScope(b)) return true;
  const sportTypesA = new Set(a.sportTypes);
  return b.sportTypes.some((sportType) => sportTypesA.has(sportType));
}

/**
 * Whether `sportType` falls under the granted scope — enforces RF-305 per
 * assignment (ProposePlanAdaptation, TM074). `sportType` comes from
 * `WorkoutTemplate.sportType` (a raw DB `String`, not statically known to be
 * canonical) — compared as a plain string, never assumed pre-validated.
 */
export function scopeIncludesSportType(scope: LicenseCoachEngagementScope, sportType: string): boolean {
  return isFullScope(scope) || (scope.sportTypes as readonly string[]).includes(sportType);
}
