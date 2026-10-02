"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { PRESCRIPTION_OUTCOME_LABELS } from "@/modules/school/presentation/workout-labels";
import { hubBasePath, type CoachAthleteScope } from "./hub-scope";
import { STALE_ATHLETE_DAYS, type RosterAthlete } from "./roster";

export type { RosterAthlete } from "./roster";

const FILTERS = {
  all: { label: "Todos", match: () => true },
  attention: {
    label: "Precisam de atenção",
    match: (athlete: RosterAthlete) =>
      athlete.pendingExecutions > 0 ||
      athlete.daysSinceLastPrescription === null ||
      athlete.daysSinceLastPrescription >= STALE_ATHLETE_DAYS,
  },
  pending: { label: "Com pendências", match: (athlete: RosterAthlete) => athlete.pendingExecutions > 0 },
  noWorkout: {
    label: "Sem treino recente",
    match: (athlete: RosterAthlete) =>
      athlete.daysSinceLastPrescription === null || athlete.daysSinceLastPrescription >= STALE_ATHLETE_DAYS,
  },
  // SAM-35 — who trained today (prescribed or not).
  today: { label: "Treinaram hoje", match: (athlete: RosterAthlete) => athlete.activityToday },
} as const;

type FilterKey = keyof typeof FILTERS;

const SORTS = {
  attention: {
    label: "Urgência",
    // Never-prescribed sorts above merely-old, and both above athletes who are
    // simply up to date; pendências break the tie.
    compare: (a: RosterAthlete, b: RosterAthlete) => {
      const rank = (athlete: RosterAthlete) =>
        athlete.daysSinceLastPrescription === null ? Number.MAX_SAFE_INTEGER : athlete.daysSinceLastPrescription;
      const byStale = rank(b) - rank(a);
      return byStale !== 0 ? byStale : b.pendingExecutions - a.pendingExecutions;
    },
  },
  name: { label: "Nome", compare: (a: RosterAthlete, b: RosterAthlete) => a.name.localeCompare(b.name, "pt-BR") },
  compliance: {
    label: "Menor compliance",
    // Athletes without a score go last: "no data" is not "doing badly", and
    // putting them first would bury the ones actually struggling.
    compare: (a: RosterAthlete, b: RosterAthlete) =>
      (a.complianceAvg ?? Number.MAX_SAFE_INTEGER) - (b.complianceAvg ?? Number.MAX_SAFE_INTEGER),
  },
  activity: {
    label: "Última atividade",
    compare: (a: RosterAthlete, b: RosterAthlete) =>
      (a.daysSinceLastActivity ?? Number.MAX_SAFE_INTEGER) - (b.daysSinceLastActivity ?? Number.MAX_SAFE_INTEGER),
  },
} as const;

type SortKey = keyof typeof SORTS;

function outcomeTone(outcome: NonNullable<RosterAthlete["todayPrescription"]>["outcome"]) {
  switch (outcome) {
    case "EXECUTED_AS_PLANNED": return "success" as const;
    case "EXECUTED_PARTIALLY":
    case "EXECUTED_DIFFERENTLY": return "warning" as const;
    default: return "neutral" as const;
  }
}

export function RosterPanel({ scope, athletes }: { scope: CoachAthleteScope; athletes: RosterAthlete[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("attention");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...athletes]
      .filter((athlete) => {
        if (!FILTERS[filter].match(athlete)) return false;
        if (!needle) return true;
        return (
          athlete.name.toLowerCase().includes(needle) ||
          (athlete.email?.toLowerCase().includes(needle) ?? false)
        );
      })
      .sort(SORTS[sort].compare);
  }, [athletes, query, filter, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          aria-label="Buscar atleta"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25 sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key
                  ? "border-white/30 bg-white/10 text-foreground"
                  : "border-white/10 text-foreground/60 hover:border-white/25"
              }`}
            >
              {FILTERS[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-foreground/45">Ordenar:</span>
        {(Object.keys(SORTS) as SortKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            aria-pressed={sort === key}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              sort === key ? "bg-white/10 text-foreground" : "text-foreground/55 hover:text-foreground"
            }`}
          >
            {SORTS[key].label}
          </button>
        ))}
        <span className="ml-auto text-xs text-foreground/45">
          {visible.length} de {athletes.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground/45">
          Nenhum atleta corresponde a este filtro.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="roster">
          {visible.map((athlete) => (
            <li key={athlete.id} data-testid="roster-athlete">
              <Link
                href={hubBasePath(scope, athlete.id)}
                aria-label={`Abrir a central de ${athlete.name}`}
                className="glass block h-full space-y-3 rounded-[20px] p-4 transition-colors hover:bg-white/[0.06]"
              >
                <div className="flex items-center gap-3">
                  {athlete.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={athlete.image} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                      {athlete.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-tight">{athlete.name}</p>
                    <p className="truncate text-xs text-foreground/45">{athlete.email ?? "—"}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {athlete.pendingExecutions > 0 && (
                    <StatusBadge tone="warning">{`${athlete.pendingExecutions} a confirmar`}</StatusBadge>
                  )}
                  {athlete.daysSinceLastPrescription === null ? (
                    <StatusBadge tone="danger">Sem treino</StatusBadge>
                  ) : (
                    athlete.daysSinceLastPrescription >= STALE_ATHLETE_DAYS && (
                      <StatusBadge tone="warning">{`${athlete.daysSinceLastPrescription}d sem treino`}</StatusBadge>
                    )
                  )}
                  {athlete.teamNames.map((team) => (
                    <StatusBadge key={team} tone="neutral">{team}</StatusBadge>
                  ))}
                </div>

                {/* SAM-35 — today: prescribed × executed, and activity nobody prescribed. */}
                <div className="flex flex-wrap gap-1.5" data-testid="roster-today">
                  {athlete.todayPrescription ? (
                    <StatusBadge tone={outcomeTone(athlete.todayPrescription.outcome)}>
                      {athlete.todayPrescription.outcome
                        ? `Hoje: ${PRESCRIPTION_OUTCOME_LABELS[athlete.todayPrescription.outcome]}`
                        : "Treino de hoje remarcado"}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Sem treino prescrito hoje</StatusBadge>
                  )}
                  {athlete.unplannedToday && <StatusBadge tone="neutral">Atividade não planejada hoje</StatusBadge>}
                  {athlete.activityToday && !athlete.unplannedToday && <StatusBadge tone="success">Atividade hoje</StatusBadge>}
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-white/8 pt-3">
                  <div>
                    <p className="text-xl font-semibold tabular-nums">
                      {athlete.complianceAvg != null ? (athlete.complianceAvg / 10).toFixed(1) : "—"}
                    </p>
                    <p className="text-xs text-foreground/45">
                      {athlete.complianceCount > 0
                        ? `Compliance (${athlete.complianceCount})`
                        : "Sem avaliação"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground/45">Último treino</p>
                    <p className="text-sm text-foreground/75">
                      {athlete.lastPrescriptionLabel ?? "nunca"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-foreground/45">Última atividade</p>
                    <p className="text-sm text-foreground/75">
                      {athlete.lastActivityLabel ?? "nenhuma"}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
