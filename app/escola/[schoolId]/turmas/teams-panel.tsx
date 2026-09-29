"use client";

import Link from "next/link";
import { Fragment, useActionState, useId, useState } from "react";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/status-badge";
import {
  archiveTeamAction,
  createTeamAction,
  updateTeamAction,
  type TeamActionState,
} from "./actions";
import { ParticipantPicker, type PersonOption } from "./participant-picker";

export type TeamRow = {
  id: string;
  name: string;
  sportType: string | null;
  level: string | null;
  location: string | null;
  notes: string | null;
  capacity: number | null;
  athleteCount: number;
  coachCount: number;
  coachNames: string[];
};

function occupancyLabel(occupancy: number, capacity: number | null) {
  return capacity === null ? String(occupancy) : `${occupancy} / ${capacity}`;
}

/**
 * `capacity` is a declaration, not a constraint — a team can legitimately sit
 * above it (someone lowered the limit without removing anyone), so this is a
 * signal to show, never a reason to block an action.
 */
function isFull(occupancy: number, capacity: number | null) {
  return capacity !== null && occupancy >= capacity;
}

export function TeamsPanel({
  schoolId,
  teams,
  athleteOptions = [],
  coachOptions = [],
}: {
  schoolId: string;
  teams: TeamRow[];
  athleteOptions?: PersonOption[];
  coachOptions?: PersonOption[];
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <CreateTeamForm
        schoolId={schoolId}
        athleteOptions={athleteOptions}
        coachOptions={coachOptions}
      />

      {teams.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground/45">
          Nenhuma turma ativa. Crie a primeira acima.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-foreground/50">
                <th className="py-3 pr-4 font-medium">Turma</th>
                <th className="py-3 pr-4 font-medium">Modalidade</th>
                <th className="py-3 pr-4 font-medium">Nível</th>
                <th className="py-3 pr-4 font-medium">Local</th>
                <th className="py-3 pr-4 font-medium">Atletas</th>
                <th className="py-3 pr-4 font-medium">Professores</th>
                <th className="py-3 pr-4 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {teams.map((team) => (
                <Fragment key={team.id}>
                  <tr className="transition-colors hover:bg-white/[0.02]">
                    <td className="py-3 pr-4 font-medium">
                      <Link href={`/escola/${schoolId}/turmas/${team.id}`} className="hover:underline">
                        {team.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-foreground/60">{team.sportType ?? "—"}</td>
                    <td className="py-3 pr-4 text-foreground/60">{team.level ?? "—"}</td>
                    <td className="py-3 pr-4 text-foreground/60">{team.location ?? "—"}</td>
                    <td className="py-3 pr-4">
                      <span className={isFull(team.athleteCount, team.capacity) ? "font-medium text-destructive" : ""}>
                        {occupancyLabel(team.athleteCount, team.capacity)}
                      </span>
                      {isFull(team.athleteCount, team.capacity) && (
                        <span className="ml-2">
                          <StatusBadge tone="danger">Lotada</StatusBadge>
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-foreground/60">
                      {team.coachCount === 0 ? (
                        <StatusBadge tone="warning">Sem professor</StatusBadge>
                      ) : (
                        team.coachNames.join(", ")
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/escola/${schoolId}/turmas/${team.id}`}
                          className="text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
                        >
                          Gerenciar
                        </Link>
                        <button
                          type="button"
                          onClick={() => setEditing(editing === team.id ? null : team.id)}
                          aria-expanded={editing === team.id}
                          className="text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
                        >
                          {editing === team.id ? "Fechar" : "Editar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editing === team.id && (
                    <tr>
                      <td colSpan={7} className="pb-4">
                        <EditTeamForm schoolId={schoolId} team={team} onDone={() => setEditing(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TeamFields({ team }: { team?: TeamRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Nome" name="name" defaultValue={team?.name} required placeholder="Ex.: Corrida — Manhã" />
      <Field label="Modalidade" name="sportType" defaultValue={team?.sportType ?? ""} placeholder="Ex.: Corrida" />
      <Field label="Nível" name="level" defaultValue={team?.level ?? ""} placeholder="Ex.: Iniciante" />
      <Field label="Local" name="location" defaultValue={team?.location ?? ""} placeholder="Ex.: Parque Ibirapuera" />
      <Field
        label="Capacidade"
        name="capacity"
        type="number"
        min={1}
        defaultValue={team?.capacity?.toString() ?? ""}
        placeholder="Sem limite"
      />
      <Field label="Observações" name="notes" defaultValue={team?.notes ?? ""} placeholder="Opcional" />
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required = false,
  type = "text",
  min,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
  min?: number;
}) {
  // Scoped per instance: the create modal and an open inline edit row render
  // the same field names at once, and a repeated DOM id would point both
  // labels at whichever input came first.
  const inputId = `${useId()}-${name}`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="text-xs font-medium text-foreground/70">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type={type}
        min={min}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
      />
    </div>
  );
}

/**
 * Creation happens in a centered modal (architecture/rules/ui.md), which is
 * what makes room for the two participant pickers: inline, the form pushed the
 * team list far below the fold.
 */
function CreateTeamForm({
  schoolId,
  athleteOptions,
  coachOptions,
}: {
  schoolId: string;
  athleteOptions: PersonOption[];
  coachOptions: PersonOption[];
}) {
  const [state, formAction] = useActionState<TeamActionState, FormData>(createTeamAction, {});
  const [open, setOpen] = useState(false);
  const [athleteIds, setAthleteIds] = useState<string[]>([]);
  const [coachIds, setCoachIds] = useState<string[]>([]);

  // Close on success during render rather than in an effect; unmounting the
  // form is also what resets its fields for the next open.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.ok) close();
  }

  function close() {
    setOpen(false);
    setAthleteIds([]);
    setCoachIds([]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-button rounded-full px-5 py-2 text-sm font-semibold text-foreground"
      >
        Nova turma
      </button>

      {open && (
        <Modal title="Nova turma" size="lg" onClose={close}>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="schoolId" value={schoolId} />
            <TeamFields />

            <ParticipantPicker
              field="athleteIds"
              label="Alunos"
              searchLabel="Buscar aluno"
              emptyLabel="Nenhum aluno ativo nesta escola. Aprove ou convide alunos antes de montar a turma."
              options={athleteOptions}
              selected={athleteIds}
              onChange={setAthleteIds}
            />

            <ParticipantPicker
              field="coachIds"
              label="Professores"
              searchLabel="Buscar professor"
              emptyLabel="Nenhum professor ativo nesta escola. Você pode criar a turma e vincular depois."
              options={coachOptions}
              selected={coachIds}
              onChange={setCoachIds}
            />

            {state.message && (
              <p role="alert" className="text-sm text-destructive">
                {state.message}
              </p>
            )}

            <div className="flex items-center gap-3">
              <SubmitButton
                pendingLabel="Criando…"
                className="glass-button rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Criar turma
              </SubmitButton>
              <button
                type="button"
                onClick={close}
                className="text-sm text-foreground/60 transition-colors hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function EditTeamForm({
  schoolId,
  team,
  onDone,
}: {
  schoolId: string;
  team: TeamRow;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<TeamActionState, FormData>(updateTeamAction, {});
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.ok) onDone();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-5">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="schoolId" value={schoolId} />
        <input type="hidden" name="teamId" value={team.id} />
        <TeamFields team={team} />
        {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
        <div className="flex items-center gap-3">
          <SubmitButton
            pendingLabel="Salvando…"
            className="glass-button rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Salvar
          </SubmitButton>
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-foreground/60 transition-colors hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      </form>

      <ArchiveTeamForm schoolId={schoolId} teamId={team.id} athleteCount={team.athleteCount} />
    </div>
  );
}

function ArchiveTeamForm({
  schoolId,
  teamId,
  athleteCount,
}: {
  schoolId: string;
  teamId: string;
  athleteCount: number;
}) {
  const [state, formAction] = useActionState<TeamActionState, FormData>(archiveTeamAction, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="space-y-2 border-t border-white/8 pt-4">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="teamId" value={teamId} />
      {confirming ? (
        <>
          <p className="text-xs text-foreground/60">
            A turma sai da lista e para de receber atletas. Nada é apagado
            {athleteCount > 0 ? ` — os ${athleteCount} atletas mantêm o histórico.` : "."}
          </p>
          <div className="flex gap-2">
            <SubmitButton
              pendingLabel="Arquivando…"
              className="rounded-full bg-rose-500/20 px-4 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
            >
              Confirmar arquivamento
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
          className="text-xs font-medium text-rose-300 underline-offset-4 hover:underline"
        >
          Arquivar turma
        </button>
      )}
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
    </form>
  );
}
