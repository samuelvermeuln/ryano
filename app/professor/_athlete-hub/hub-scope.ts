/**
 * SAM-30 — where the coach's athlete hub lives for one scope.
 *
 * The same screens serve two route trees: `/professor/<schoolId>/atletas/<id>`
 * (school) and `/professor/independente/atletas/<id>` (independent coaching).
 * Everything that used to build a URL from `schoolId` builds it from the scope
 * here, so no screen hard-codes either prefix. The folder is `_athlete-hub`
 * (underscore = private, never a route); the thin `page.tsx` files in both
 * trees only pick the scope and render the screen.
 */
import type { CoachAthleteScope } from "@/modules/school/application/coach-athlete-scope";

export type { CoachAthleteScope } from "@/modules/school/application/coach-athlete-scope";

export type AthleteHubSection = "resumo" | "treinos" | "analise" | "ficha-tecnica" | "historico";

export const ATHLETE_HUB_SECTIONS: Array<{ id: AthleteHubSection; label: string; segment: string }> = [
  { id: "resumo", label: "Resumo", segment: "" },
  { id: "treinos", label: "Treinos", segment: "/treinos" },
  { id: "analise", label: "Análise", segment: "/analise" },
  { id: "ficha-tecnica", label: "Ficha técnica", segment: "/ficha-tecnica" },
  { id: "historico", label: "Histórico", segment: "/historico" },
];

/** The scope the school tree renders with; the independent tree uses {@link INDEPENDENT_SCOPE}. */
export function schoolScope(schoolId: string): CoachAthleteScope {
  return { kind: "school", schoolId };
}

export const INDEPENDENT_SCOPE: CoachAthleteScope = { kind: "independent" };

/** `/professor/<schoolId>/atletas/<athleteId>` or `/professor/independente/atletas/<athleteId>`. */
export function hubBasePath(scope: CoachAthleteScope, athleteId: string): string {
  const prefix = scope.kind === "school" ? `/professor/${scope.schoolId}` : "/professor/independente";
  return `${prefix}/atletas/${athleteId}`;
}

export function athleteHubHref(scope: CoachAthleteScope, athleteId: string, section: AthleteHubSection): string {
  const segment = ATHLETE_HUB_SECTIONS.find((entry) => entry.id === section)?.segment ?? "";
  return `${hubBasePath(scope, athleteId)}${segment}`;
}

/** The breadcrumb's first step: the list the athlete came from. */
export function hubCrumb(scope: CoachAthleteScope): { href: string; label: string } {
  return scope.kind === "school"
    ? { href: `/professor/${scope.schoolId}/atletas`, label: "Meus atletas" }
    : { href: "/professor/independente", label: "Coach independente" };
}

/** The hidden form field value the server actions turn back into a scope. */
export function scopeFormValue(scope: CoachAthleteScope): string {
  return scope.kind === "school" ? scope.schoolId : "";
}

/** Inverse of {@link scopeFormValue}: an empty/absent school id means independent. */
export function scopeFromFormValue(schoolId: string | null | undefined): CoachAthleteScope {
  return schoolId ? { kind: "school", schoolId } : INDEPENDENT_SCOPE;
}
