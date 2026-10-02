/**
 * SAM-11 — chrome shared by every screen of the athlete hub: identity header and
 * the section tabs.
 *
 * A Server Component: the tabs are plain links, so moving between sections is a
 * navigation with its own URL (shareable, bookmarkable, and back-button
 * friendly) instead of hidden client state. `aria-current` marks the active one.
 *
 * SAM-30 — the same chrome serves the school hub and the independent hub; every
 * address comes from the scope (`hub-scope.ts`), never from a hard-coded prefix.
 *
 * Surfaces come from `glass` / `theme-pill-*` / `border-white/10`, which have
 * light-theme variants — never a hard-coded panel colour (architecture/rules/ui.md).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import {
  ATHLETE_HUB_SECTIONS,
  athleteHubHref,
  hubCrumb,
  type AthleteHubSection,
  type CoachAthleteScope,
} from "./hub-scope";

export { athleteHubHref, type AthleteHubSection } from "./hub-scope";

export function AthleteHubShell({
  scope,
  athlete,
  teams,
  currentCoach,
  isResponsibleCoach,
  active,
  children,
  actions,
}: {
  scope: CoachAthleteScope;
  athlete: { id: string; name: string | null; email: string | null; image: string | null };
  teams: string[];
  currentCoach: { coachId: string; name: string } | null;
  isResponsibleCoach: boolean;
  active: AthleteHubSection;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const displayName = athlete.name ?? athlete.email ?? "Atleta";
  const crumb = hubCrumb(scope);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <nav aria-label="Trilha de navegação" className="text-xs text-foreground/50">
        <Link href={crumb.href} className="underline-offset-4 hover:underline">
          {crumb.label}
        </Link>
        <span aria-hidden> › </span>
        <span className="text-foreground/70">{displayName}</span>
      </nav>

      <header className="glass flex flex-col gap-4 rounded-[24px] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-4">
          <UserAvatar name={displayName} image={athlete.image} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{displayName}</h1>
            {athlete.email && <p className="truncate text-sm text-foreground/60">{athlete.email}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {scope.kind === "independent"
                ? <StatusBadge tone="neutral">Acompanhamento independente</StatusBadge>
                : teams.length > 0
                  ? teams.map((team) => <StatusBadge key={team} tone="neutral">{team}</StatusBadge>)
                  : <span className="text-xs text-foreground/45">Sem turma</span>}
              {/* Says who prescribes for this athlete, so an administrator
                  reading the hub knows why the actions are not offered to them. */}
              {isResponsibleCoach
                ? <StatusBadge tone="success">Você é o professor responsável</StatusBadge>
                : currentCoach
                  ? <StatusBadge tone="neutral">{`Responsável: ${currentCoach.name}`}</StatusBadge>
                  : <StatusBadge tone="warning">Sem professor responsável</StatusBadge>}
            </div>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>

      <nav aria-label="Seções do atleta" className="overflow-x-auto">
        <ul className="flex min-w-max gap-2">
          {ATHLETE_HUB_SECTIONS.map((section) => {
            const isActive = section.id === active;
            return (
              <li key={section.id}>
                <Link
                  href={athleteHubHref(scope, athlete.id, section.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`block rounded-full border px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? "theme-pill-info font-medium"
                      : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10 hover:text-foreground"
                  }`}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {children}
    </div>
  );
}

/**
 * Shown whenever a screen had to leave data out. Consent and membership periods
 * are the reasons, and the coach is told the reason rather than presented with a
 * shorter history that looks complete (ADR-005).
 */
export function WithheldNotice({ children }: { children: string }) {
  return (
    <p className="theme-panel-warning rounded-[20px] border px-4 py-3 text-xs leading-6">
      {children}
    </p>
  );
}
