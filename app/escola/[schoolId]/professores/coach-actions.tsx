"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import {
  cancelWorkoutChangeAction,
  deactivateCoachAction,
  inviteCoachAction,
  requestWorkoutChangeAction,
  assignAthleteToCoachAction,
  type CoachActionState,
} from "./actions";

/**
 * Generates a SCHOOL_COACH invite link and shows it for copying.
 *
 * The link is only rendered right after creation. The full list lives on the
 * invites screen, which is also where it can be revoked.
 */
export function InviteCoachForm({ schoolId }: { schoolId: string }) {
  const [state, formAction] = useActionState<CoachActionState, FormData>(inviteCoachAction, {});
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const inviteUrl = state.inviteToken && typeof window !== "undefined"
    ? `${window.location.origin}/entrar/convite/${state.inviteToken}`
    : null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-button rounded-full px-5 py-2 text-sm font-semibold text-foreground"
      >
        Convidar professor
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 space-y-4 sm:max-w-md">
      {inviteUrl ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Convite criado</p>
          <p className="text-xs text-foreground/50 font-mono break-all">{inviteUrl}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // Clipboard unavailable (non-secure origin); the link is visible above.
                }
              }}
              className="glass-button rounded-full px-4 py-2 text-xs font-semibold text-foreground"
            >
              {copied ? "Copiado!" : "Copiar link"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-foreground/60 hover:text-foreground transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="schoolId" value={schoolId} />
          <div className="space-y-1.5">
            <label htmlFor="invite-days" className="text-sm font-medium">Validade (dias)</label>
            <input
              id="invite-days"
              name="expiresInDays"
              type="number"
              min={1}
              max={90}
              defaultValue={14}
              className="w-28 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requiresApproval" defaultChecked className="accent-current" />
            Exigir aprovação após o aceite
          </label>
          {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
          <div className="flex items-center gap-3">
            <SubmitButton
              pendingLabel="Gerando…"
              className="glass-button rounded-full px-5 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
            >
              Gerar convite
            </SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-foreground/60 hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function DeactivateCoachButton({
  schoolId,
  membershipId,
}: {
  schoolId: string;
  membershipId: string;
}) {
  const [state, formAction] = useActionState<CoachActionState, FormData>(deactivateCoachAction, {});
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs font-medium text-destructive hover:underline"
        >
          Desativar
        </button>
        {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <p className="text-xs text-foreground/60">
        Encerra o vínculo. As prescrições já feitas são mantidas.
      </p>
      <div className="flex items-center gap-2">
        <SubmitButton
          pendingLabel="Desativando…"
          className="text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
        >
          Confirmar
        </SubmitButton>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-foreground/60 hover:text-foreground transition-colors"
        >
          Cancelar
        </button>
      </div>
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
    </form>
  );
}

export function AssignAthleteForm({
  schoolId,
  membershipId,
  coachId,
  athletes,
}: {
  schoolId: string;
  membershipId: string;
  coachId: string;
  athletes: { id: string; label: string; currentCoach: string | null }[];
}) {
  const [state, formAction] = useActionState<CoachActionState, FormData>(assignAthleteToCoachAction, {});

  if (athletes.length === 0) {
    return (
      <p className="text-sm text-foreground/45">
        Não há atletas disponíveis para encaminhar.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="coachId" value={coachId} />
      <div className="space-y-1.5 min-w-[16rem] flex-1">
        <label htmlFor="assign-athlete" className="text-sm font-medium">Atleta</label>
        <select
          id="assign-athlete"
          name="athleteId"
          defaultValue={athletes[0]?.id}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
        >
          {athletes.map((athlete) => (
            <option key={athlete.id} value={athlete.id}>
              {athlete.label}
              {athlete.currentCoach ? ` — hoje com ${athlete.currentCoach}` : " — sem professor"}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton
        pendingLabel="Encaminhando…"
        className="glass-button rounded-full px-5 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
      >
        Encaminhar
      </SubmitButton>
      {state.message && (
        <p role="alert" className="w-full text-sm text-destructive">{state.message}</p>
      )}
    </form>
  );
}

/**
 * Asks the coach to revise a prescription. Collapsed by default so the
 * prescriptions list stays readable — most rows are never acted upon.
 */
export function RequestChangeForm({
  schoolId,
  membershipId,
  workoutAssignmentId,
  hasOpenRequest,
}: {
  schoolId: string;
  membershipId: string;
  workoutAssignmentId: string;
  hasOpenRequest: boolean;
}) {
  const [state, formAction] = useActionState<CoachActionState, FormData>(requestWorkoutChangeAction, {});
  const [open, setOpen] = useState(false);
  // Adjust during render instead of in an effect, which would cascade an extra
  // render; collapsing unmounts the textarea so it reopens empty.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  if (hasOpenRequest) {
    return <span className="text-xs text-foreground/45">Alteração solicitada</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium hover:underline"
      >
        Solicitar alteração
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="workoutAssignmentId" value={workoutAssignmentId} />
      <label htmlFor={`reason-${workoutAssignmentId}`} className="sr-only">
        O que precisa ser alterado
      </label>
      <textarea
        id={`reason-${workoutAssignmentId}`}
        name="reason"
        required
        rows={3}
        maxLength={2000}
        placeholder="O que precisa ser alterado?"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
      />
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton
          pendingLabel="Enviando…"
          className="glass-button rounded-full px-4 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
        >
          Enviar
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-foreground/60 hover:text-foreground transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function CancelChangeRequestButton({
  schoolId,
  membershipId,
  requestId,
}: {
  schoolId: string;
  membershipId: string;
  requestId: string;
}) {
  const [state, formAction] = useActionState<CoachActionState, FormData>(cancelWorkoutChangeAction, {});

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="requestId" value={requestId} />
      <SubmitButton
        pendingLabel="Retirando…"
        className="text-xs text-foreground/60 hover:text-foreground transition-colors disabled:opacity-50"
      >
        Retirar solicitação
      </SubmitButton>
      {state.message && <span role="alert" className="text-xs text-destructive">{state.message}</span>}
    </form>
  );
}
