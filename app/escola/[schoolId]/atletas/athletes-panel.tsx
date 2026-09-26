"use client";

import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/status-badge";
import {
  assignCoachAction,
  bulkAssignCoachAction,
  changeCoachAction,
  endAssignmentAction,
  removeAthleteAction,
  type AthleteActionState,
} from "./actions";

export type AthleteRow = {
  membershipId: string;
  athleteId: string;
  name: string;
  email: string | null;
  status: string;
  since: string;
  coach: { assignmentId: string; coachId: string; name: string } | null;
  teams: string[];
  lastActivityAt: string | null;
  plannedThisWeek: number;
  completedThisWeek: number;
};

export type CoachOption = { coachId: string; name: string; suspended: boolean; athleteCount: number };

type Filter = "all" | "lobby" | "active" | "inactive" | "idle";

const FILTER_LABELS: Record<Filter, string> = {
  all: "Todos",
  lobby: "Sem professor",
  active: "Ativos",
  inactive: "Inativos",
  idle: "Sem treino 14d",
};

/** An athlete with no recorded activity in two weeks is the one a school wants to call. */
const IDLE_DAYS = 14;

function isIdle(row: AthleteRow): boolean {
  if (row.status !== "ACTIVE") return false;
  if (!row.lastActivityAt) return true;
  return Date.now() - new Date(row.lastActivityAt).getTime() > IDLE_DAYS * 86_400_000;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function relativeDays(value: string | null): string {
  if (!value) return "nunca";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

export function AthletesPanel({
  schoolId,
  athletes,
  coaches,
}: {
  schoolId: string;
  athletes: AthleteRow[];
  coaches: CoachOption[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return athletes.filter((row) => {
      if (needle && !`${row.name} ${row.email ?? ""}`.toLowerCase().includes(needle)) return false;
      if (filter === "lobby") return row.status === "ACTIVE" && !row.coach;
      if (filter === "active") return row.status === "ACTIVE";
      if (filter === "inactive") return row.status !== "ACTIVE";
      if (filter === "idle") return isIdle(row);
      return true;
    });
  }, [athletes, query, filter]);

  // Selecting is only meaningful for athletes who can actually receive a first
  // assignment; keeping an already-assigned athlete selected would produce a
  // guaranteed COACH_ATHLETE_ASSIGNMENT_CONFLICT for the whole batch.
  const selectableIds = useMemo(
    () => visible.filter((row) => row.status === "ACTIVE" && !row.coach).map((row) => row.athleteId),
    [visible],
  );
  const effectiveSelection = selected.filter((athleteId) => selectableIds.includes(athleteId));

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
          {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
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
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {effectiveSelection.length > 0 && (
        <BulkAssignBar
          schoolId={schoolId}
          coaches={coaches}
          athleteIds={effectiveSelection}
          onDone={() => setSelected([])}
        />
      )}

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground/45">
          Nenhum atleta corresponde a este filtro.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-foreground/50">
                <th className="w-8 py-3 pr-2">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos sem professor"
                    checked={selectableIds.length > 0 && effectiveSelection.length === selectableIds.length}
                    onChange={(event) => setSelected(event.target.checked ? selectableIds : [])}
                    disabled={selectableIds.length === 0}
                    className="accent-current"
                  />
                </th>
                <th className="py-3 pr-4 font-medium">Atleta</th>
                <th className="py-3 pr-4 font-medium">Professor</th>
                <th className="py-3 pr-4 font-medium">Turmas</th>
                <th className="py-3 pr-4 font-medium">Semana</th>
                <th className="py-3 pr-4 font-medium">Última atividade</th>
                <th className="py-3 pr-4 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visible.map((row) => {
                const selectable = row.status === "ACTIVE" && !row.coach;
                return (
                  <tr key={row.membershipId} className="align-top transition-colors hover:bg-white/[0.02]">
                    <td className="py-3 pr-2">
                      {selectable && (
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${row.name}`}
                          checked={effectiveSelection.includes(row.athleteId)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, row.athleteId]
                                : current.filter((id) => id !== row.athleteId),
                            )
                          }
                          className="accent-current"
                        />
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-xs text-foreground/50">{row.email ?? "—"}</span>
                      <span className="mt-1 block text-xs text-foreground/40">
                        Desde {formatDate(row.since)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {row.status !== "ACTIVE" ? (
                        <StatusBadge tone="neutral">Desligado</StatusBadge>
                      ) : row.coach ? (
                        row.coach.name
                      ) : (
                        <StatusBadge tone="warning">Sem professor</StatusBadge>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-foreground/60">
                      {row.teams.length > 0 ? row.teams.join(", ") : "—"}
                    </td>
                    <td className="py-3 pr-4 text-xs tabular-nums text-foreground/70">
                      {row.completedThisWeek}/{row.plannedThisWeek}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      <span className={isIdle(row) ? "text-amber-400" : "text-foreground/50"}>
                        {relativeDays(row.lastActivityAt)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {row.status === "ACTIVE" && (
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === row.membershipId ? null : row.membershipId)}
                          aria-expanded={expanded === row.membershipId}
                          className="text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
                        >
                          {expanded === row.membershipId ? "Fechar" : "Gerenciar"}
                        </button>
                      )}
                      {expanded === row.membershipId && (
                        <AthleteActions schoolId={schoolId} row={row} coaches={coaches} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CoachSelect({ coaches, current }: { coaches: CoachOption[]; current?: string }) {
  return (
    <select
      name="coachId"
      required
      defaultValue=""
      aria-label="Professor"
      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
    >
      <option value="" disabled>
        Selecione um professor…
      </option>
      {coaches.map((coach) => (
        // A suspended coach keeps their athletes but can receive none, so the
        // option is disabled here instead of letting the server reject it.
        <option key={coach.coachId} value={coach.coachId} disabled={coach.suspended || coach.coachId === current}>
          {coach.name}
          {coach.suspended ? " (desativado)" : ` — ${coach.athleteCount} atleta(s)`}
        </option>
      ))}
    </select>
  );
}

function BulkAssignBar({
  schoolId,
  coaches,
  athleteIds,
  onDone,
}: {
  schoolId: string;
  coaches: CoachOption[];
  athleteIds: string[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<AthleteActionState, FormData>(bulkAssignCoachAction, {});
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.ok) onDone();
  }

  return (
    <form action={formAction} className="theme-panel-warning flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center">
      <input type="hidden" name="schoolId" value={schoolId} />
      {athleteIds.map((athleteId) => (
        <input key={athleteId} type="hidden" name="athleteIds" value={athleteId} />
      ))}
      <p className="text-sm font-medium">
        {athleteIds.length} atleta(s) selecionado(s)
      </p>
      <div className="sm:w-64">
        <CoachSelect coaches={coaches} />
      </div>
      <SubmitButton
        pendingLabel="Atribuindo…"
        className="glass-button rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
      >
        Atribuir em lote
      </SubmitButton>
      {state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}

function AthleteActions({
  schoolId,
  row,
  coaches,
}: {
  schoolId: string;
  row: AthleteRow;
  coaches: CoachOption[];
}) {
  return (
    <div className="mt-3 w-72 space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      {row.coach ? (
        <>
          <ChangeCoachForm schoolId={schoolId} row={row} coaches={coaches} />
          <InlineAction
            action={endAssignmentAction}
            label="Encerrar acompanhamento"
            pendingLabel="Encerrando…"
            hint="O atleta volta para o lobby, sem professor."
            fields={{ schoolId, assignmentId: row.coach.assignmentId }}
          />
        </>
      ) : (
        <AssignCoachForm schoolId={schoolId} row={row} coaches={coaches} />
      )}

      <InlineAction
        action={removeAthleteAction}
        label="Desligar da escola"
        pendingLabel="Desligando…"
        hint="Encerra o vínculo. O histórico é preservado."
        danger
        fields={{ schoolId, membershipId: row.membershipId }}
      />
    </div>
  );
}

function AssignCoachForm({ schoolId, row, coaches }: { schoolId: string; row: AthleteRow; coaches: CoachOption[] }) {
  const [state, formAction] = useActionState<AthleteActionState, FormData>(assignCoachAction, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="athleteId" value={row.athleteId} />
      <p className="text-xs font-medium text-foreground/70">Atribuir professor</p>
      <CoachSelect coaches={coaches} />
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      <SubmitButton
        pendingLabel="Atribuindo…"
        className="glass-button w-full rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        Atribuir
      </SubmitButton>
    </form>
  );
}

function ChangeCoachForm({ schoolId, row, coaches }: { schoolId: string; row: AthleteRow; coaches: CoachOption[] }) {
  const [state, formAction] = useActionState<AthleteActionState, FormData>(changeCoachAction, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="athleteId" value={row.athleteId} />
      <p className="text-xs font-medium text-foreground/70">Trocar professor</p>
      <CoachSelect coaches={coaches} current={row.coach?.coachId} />
      <input
        name="reason"
        maxLength={500}
        placeholder="Motivo (opcional)"
        aria-label="Motivo da troca"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs outline-none focus:border-white/25"
      />
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      <SubmitButton
        pendingLabel="Trocando…"
        className="glass-button w-full rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        Trocar
      </SubmitButton>
    </form>
  );
}

function InlineAction({
  action,
  label,
  pendingLabel,
  hint,
  fields,
  danger = false,
}: {
  action: (prev: AthleteActionState, formData: FormData) => Promise<AthleteActionState>;
  label: string;
  pendingLabel: string;
  hint: string;
  fields: Record<string, string>;
  danger?: boolean;
}) {
  const [state, formAction] = useActionState<AthleteActionState, FormData>(action, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="space-y-1 border-t border-white/8 pt-3">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {confirming ? (
        <>
          <p className="text-xs text-foreground/60">{hint}</p>
          <div className="flex gap-2">
            <SubmitButton
              pendingLabel={pendingLabel}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                danger ? "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30" : "glass-button"
              }`}
            >
              Confirmar
            </SubmitButton>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-foreground/60 transition-colors hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`text-xs font-medium underline-offset-4 hover:underline ${
            danger ? "text-rose-300" : "text-foreground/70 hover:text-foreground"
          }`}
        >
          {label}
        </button>
      )}
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
    </form>
  );
}
