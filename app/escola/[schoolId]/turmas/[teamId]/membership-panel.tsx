"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import {
  addAthleteToTeamAction,
  addCoachToTeamAction,
  removeAthleteFromTeamAction,
  removeCoachFromTeamAction,
  type TeamActionState,
} from "../actions";

export type PersonRow = { id: string; name: string; email: string | null };

type Common = { schoolId: string; teamId: string; disabled?: boolean };

/**
 * Roster editor shared by the athletes and coaches sections of the team page.
 * The two differ only in the field name the server action expects
 * (`athleteId` vs `coachId`) and in their labels, so they are one component
 * parameterised by kind rather than two near-identical ones.
 */
export function MembershipPanel({
  schoolId,
  teamId,
  kind,
  members,
  candidates,
  disabled = false,
}: Common & {
  kind: "athlete" | "coach";
  members: PersonRow[];
  candidates: PersonRow[];
}) {
  const isAthlete = kind === "athlete";
  const fieldName = isAthlete ? "athleteId" : "coachId";
  const addAction = isAthlete ? addAthleteToTeamAction : addCoachToTeamAction;
  const removeAction = isAthlete ? removeAthleteFromTeamAction : removeCoachFromTeamAction;

  return (
    <div className="space-y-4">
      {!disabled && (
        <AddMemberForm
          schoolId={schoolId}
          teamId={teamId}
          fieldName={fieldName}
          action={addAction}
          candidates={candidates}
          label={isAthlete ? "Adicionar atleta" : "Adicionar professor"}
          emptyHint={
            isAthlete
              ? "Todos os atletas ativos da escola já estão nesta turma."
              : "Todos os professores ativos da escola já estão nesta turma."
          }
        />
      )}

      {members.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground/45">
          {isAthlete ? "Nenhum atleta nesta turma." : "Nenhum professor vinculado."}
        </p>
      ) : (
        <ul className="divide-y divide-white/5">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <div>
                <span className="font-medium">{member.name}</span>
                <span className="block text-xs text-foreground/50">{member.email ?? "—"}</span>
              </div>
              {!disabled && (
                <RemoveMemberForm
                  schoolId={schoolId}
                  teamId={teamId}
                  fieldName={fieldName}
                  memberId={member.id}
                  action={removeAction}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddMemberForm({
  schoolId,
  teamId,
  fieldName,
  action,
  candidates,
  label,
  emptyHint,
}: Common & {
  fieldName: string;
  action: (prev: TeamActionState, formData: FormData) => Promise<TeamActionState>;
  candidates: PersonRow[];
  label: string;
  emptyHint: string;
}) {
  const [state, formAction] = useActionState<TeamActionState, FormData>(action, {});

  if (candidates.length === 0) {
    return <p className="text-xs text-foreground/45">{emptyHint}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="teamId" value={teamId} />
      <select
        name={fieldName}
        required
        defaultValue=""
        aria-label={label}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25 sm:max-w-xs"
      >
        <option value="" disabled>
          Selecione…
        </option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
            {candidate.email ? ` — ${candidate.email}` : ""}
          </option>
        ))}
      </select>
      <SubmitButton
        pendingLabel="Adicionando…"
        className="glass-button rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {label}
      </SubmitButton>
      {state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}

function RemoveMemberForm({
  schoolId,
  teamId,
  fieldName,
  memberId,
  action,
}: Common & {
  fieldName: string;
  memberId: string;
  action: (prev: TeamActionState, formData: FormData) => Promise<TeamActionState>;
}) {
  const [state, formAction] = useActionState<TeamActionState, FormData>(action, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="shrink-0 text-right">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name={fieldName} value={memberId} />
      {confirming ? (
        <div className="flex items-center gap-2">
          <SubmitButton
            pendingLabel="Removendo…"
            className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
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
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs font-medium text-foreground/60 underline-offset-4 hover:text-rose-300 hover:underline"
        >
          Remover
        </button>
      )}
      {state.message && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
