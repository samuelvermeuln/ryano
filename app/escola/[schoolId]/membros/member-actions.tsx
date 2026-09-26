"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { SCHOOL_ROLE_LABELS } from "@/modules/school/presentation/role-labels";
import type { SchoolRole } from "@/modules/school/domain/enums";
import {
  addRoleAction,
  deactivateMemberAction,
  removeRoleAction,
  type MemberActionState,
} from "./actions";

/**
 * Ending a membership is irreversible from the UI — the person has to be
 * re-added — so the destructive action is behind an explicit confirmation step
 * instead of a single click.
 */
export function DeactivateMemberButton({
  schoolId,
  membershipId,
  disabled,
  disabledReason,
}: {
  schoolId: string;
  membershipId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction] = useActionState<MemberActionState, FormData>(deactivateMemberAction, {});
  const [confirming, setConfirming] = useState(false);

  if (disabled) {
    return <span className="text-xs text-foreground/40">{disabledReason ?? "—"}</span>;
  }

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
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="membershipId" value={membershipId} />
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
    </form>
  );
}

export function MemberRoleEditor({
  schoolId,
  membershipId,
  roles,
  assignableRoles,
  canEdit,
}: {
  schoolId: string;
  membershipId: string;
  roles: SchoolRole[];
  assignableRoles: SchoolRole[];
  canEdit: boolean;
}) {
  const [addState, addAction] = useActionState<MemberActionState, FormData>(addRoleAction, {});
  const [removeState, removeAction] = useActionState<MemberActionState, FormData>(removeRoleAction, {});

  const available = assignableRoles.filter((role) => !roles.includes(role));
  const message = addState.message ?? removeState.message;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {roles.length === 0 && <span className="text-sm text-foreground/40">Nenhum papel.</span>}
        {roles.map((role) => (
          <span
            key={role}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs"
          >
            {SCHOOL_ROLE_LABELS[role]}
            {canEdit && roles.length > 1 && (
              <form action={removeAction} className="inline">
                <input type="hidden" name="schoolId" value={schoolId} />
                <input type="hidden" name="membershipId" value={membershipId} />
                <input type="hidden" name="role" value={role} />
                <button
                  type="submit"
                  aria-label={`Remover papel ${SCHOOL_ROLE_LABELS[role]}`}
                  className="text-foreground/50 hover:text-destructive transition-colors"
                >
                  ×
                </button>
              </form>
            )}
          </span>
        ))}
      </div>

      {canEdit && available.length > 0 && (
        <form action={addAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="membershipId" value={membershipId} />
          <label htmlFor="add-role" className="sr-only">Adicionar papel</label>
          <select
            id="add-role"
            name="role"
            defaultValue={available[0]}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs outline-none focus:border-white/25"
          >
            {available.map((role) => (
              <option key={role} value={role}>{SCHOOL_ROLE_LABELS[role]}</option>
            ))}
          </select>
          <SubmitButton
            pendingLabel="Adicionando…"
            className="glass-button rounded-full px-4 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
          >
            Adicionar papel
          </SubmitButton>
        </form>
      )}

      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    </div>
  );
}
