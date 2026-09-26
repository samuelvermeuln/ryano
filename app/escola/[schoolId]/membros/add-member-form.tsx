"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import {
  ASSIGNABLE_SCHOOL_ROLES,
  SCHOOL_ROLE_LABELS,
} from "@/modules/school/presentation/role-labels";
import { addMemberAction, type MemberActionState } from "./actions";

export function AddMemberForm({ schoolId }: { schoolId: string }) {
  const [state, formAction] = useActionState<MemberActionState, FormData>(addMemberAction, {});
  const [open, setOpen] = useState(false);
  // Collapse on success by adjusting state during render rather than in an
  // effect, which would cascade an extra render. Closing unmounts the form, so
  // the next open starts from clean defaults with no explicit reset.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-button rounded-full px-5 py-2 text-sm font-semibold text-foreground"
      >
        Adicionar membro
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 space-y-4"
    >
      <input type="hidden" name="schoolId" value={schoolId} />

      <div className="space-y-1.5">
        <label htmlFor="member-email" className="text-sm font-medium">
          E-mail da pessoa
        </label>
        <input
          id="member-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="pessoa@exemplo.com"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
        />
        <p className="text-xs text-foreground/50">
          A pessoa precisa já ter uma conta Ryvano ativa. Para quem ainda não tem, use um convite.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Papéis</legend>
        <div className="flex flex-wrap gap-2">
          {ASSIGNABLE_SCHOOL_ROLES.map((role) => (
            <label
              key={role}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs cursor-pointer hover:border-white/25"
            >
              <input type="checkbox" name="roles" value={role} className="accent-current" />
              {SCHOOL_ROLE_LABELS[role]}
            </label>
          ))}
        </div>
      </fieldset>

      {state.message && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton
          pendingLabel="Adicionando…"
          className="glass-button rounded-full px-5 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
        >
          Adicionar membro
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
  );
}
