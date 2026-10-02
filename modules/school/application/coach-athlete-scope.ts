/**
 * SAM-30 — where a coach works with one athlete: inside a school, or as an
 * independent coach (CoachAthleteAssignment with `schoolId` NULL).
 *
 * Every coach-facing athlete screen and use case takes a scope. A plain string
 * is the school id (the shape every caller used before SAM-30), so school
 * callers are untouched; `{ kind: "independent" }` is the new context.
 *
 * The one invariant this file guards: an independent scope is NEVER
 * `{ schoolId: null }` alone. Marketplace-licence sessions (`coachId` NULL),
 * self-logged sessions and other independent coaches' prescriptions all share
 * that NULL, so the independent scope is `{ schoolId: null, coachId }`. The
 * school scope is exactly `{ schoolId }`, byte-for-byte what it was.
 */

export type CoachAthleteScope =
  | { kind: "school"; schoolId: string }
  | { kind: "independent" };

/** A school id (legacy shape) or an explicit scope. */
export type CoachAthleteScopeInput = string | CoachAthleteScope;

export function toCoachAthleteScope(input: CoachAthleteScopeInput): CoachAthleteScope {
  return typeof input === "string" ? { kind: "school", schoolId: input } : input;
}

/** The part of a resolved context the scope helpers need. */
export type ScopedContext = { schoolId: string | null; coachId: string };

/** Prisma `where` fragment that selects the prescriptions of this relationship. */
export type PrescriptionScope =
  | { schoolId: string }
  | { schoolId: null; coachId: string };

export function prescriptionScope(context: ScopedContext): PrescriptionScope {
  return context.schoolId === null
    ? { schoolId: null, coachId: context.coachId }
    : { schoolId: context.schoolId };
}

/** In-memory counterpart of {@link prescriptionScope}, for a row already loaded. */
export function isInPrescriptionScope(
  row: { schoolId: string | null; coachId: string | null },
  context: ScopedContext,
): boolean {
  return context.schoolId === null
    ? row.schoolId === null && row.coachId === context.coachId
    : row.schoolId === context.schoolId;
}

/**
 * Where the technical sheet of this relationship lives. Inside a school it is
 * the compound unique `(schoolId, athleteId)`; outside one it is the partial
 * unique `(coachId, athleteId) WHERE schoolId IS NULL` (migration 0056), which
 * Prisma cannot address with `findUnique`, hence a plain `where`.
 */
export type TechnicalSheetScope =
  | { kind: "school"; where: { schoolId: string; athleteId: string } }
  | { kind: "independent"; where: { schoolId: null; coachId: string; athleteId: string } };

export function technicalSheetScope(context: ScopedContext, athleteId: string): TechnicalSheetScope {
  return context.schoolId === null
    ? { kind: "independent", where: { schoolId: null, coachId: context.coachId, athleteId } }
    : { kind: "school", where: { schoolId: context.schoolId, athleteId } };
}
