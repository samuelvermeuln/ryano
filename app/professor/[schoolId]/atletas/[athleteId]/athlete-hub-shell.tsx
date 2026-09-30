/**
 * SAM-11 — chrome shared by every screen of the athlete hub: identity header and
 * the section tabs.
 *
 * A Server Component: the tabs are plain links, so moving between sections is a
 * navigation with its own URL (shareable, bookmarkable, and back-button
 * friendly) instead of hidden client state. `aria-current` marks the active one.
 *
 * Surfaces come from `glass` / `theme-pill-*` / `border-white/10`, which have
 * light-theme variants — never a hard-coded panel colour (architecture/rules/ui.md).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";

export type AthleteHubSection = "resumo" | "treinos" | "analise" | "ficha-tecnica" | "historico";

const SECTIONS: Array<{ id: AthleteHubSection; label: string; segment: string }> = [
  { id: "resumo", label: "Resumo", segment: "" },
  { id: "treinos", label: "Treinos", segment: "/treinos" },
  { id: "analise", label: "Análise", segment: "/analise" },
  { id: "ficha-tecnica", label: "Ficha técnica", segment: "/ficha-tecnica" },
  { id: "historico", label: "Histórico", segment: "/historico" },
];

export function athleteHubHref(schoolId: string, athleteId: string, section: AthleteHubSection): string {
  const base = `/professor/${schoolId}/atletas/${athleteId}`;
  return `${base}${SECTIONS.find((entry) => entry.id === section)?.segment ?? ""}`;
}

export function AthleteHubShell({
  schoolId,
  athlete,
  teams,
  currentCoach,
  isResponsibleCoach,
  active,
  children,
  actions,
}: {
  schoolId: string;
  athlete: { id: string; name: string | null; email: string | null; image: string | null };
  teams: string[];
  currentCoach: { coachId: string; name: string } | null;
  isResponsibleCoach: boolean;
  active: AthleteHubSection;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const displayName = athlete.name ?? athlete.email ?? "Atleta";

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <nav aria-label="Trilha de navegação" className="text-xs text-foreground/50">
        <Link href={`/professor/${schoolId}/atletas`} className="underline-offset-4 hover:underline">
          Meus atletas
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
              {teams.length > 0
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
          {SECTIONS.map((section) => {
            const isActive = section.id === active;
            return (
              <li key={section.id}>
                <Link
                  href={athleteHubHref(schoolId, athlete.id, section.id)}
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
