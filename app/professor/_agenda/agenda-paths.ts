/**
 * SAM-36 — where the coach's calendar lives for one scope. No directive:
 * usable from Server Components, Client Components and server actions.
 */
import type { CoachAthleteScope } from "@/app/professor/_athlete-hub/hub-scope";

export type AgendaQuery = {
  /** ISO week `YYYY-Www` (week view) */
  semana?: string;
  /** `YYYY-MM` (month view) */
  mes?: string;
  visao?: string;
  turma?: string;
  modalidade?: string;
  atleta?: string;
  "sem-professor"?: string;
  tipo?: string;
  dia?: string;
};

/** `/professor/<schoolId>/agenda` or `/professor/independente/calendario`. */
export function agendaBasePath(scope: CoachAthleteScope): string {
  return scope.kind === "school" ? `/professor/${scope.schoolId}/agenda` : "/professor/independente/calendario";
}

export function agendaHref(scope: CoachAthleteScope, query: AgendaQuery, patch: Partial<AgendaQuery>): string {
  const next: AgendaQuery = { ...query, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value);
  }
  const suffix = params.toString();
  return `${agendaBasePath(scope)}${suffix ? `?${suffix}` : ""}`;
}
