"use client";

import { useActionState, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import {
  ASSIGNABLE_SCHOOL_ROLES,
  SCHOOL_ROLE_LABELS,
} from "@/modules/school/presentation/role-labels";
import { addMemberAction, type MemberActionState } from "./actions";

/**
 * Admission happens in a centered modal over the members screen itself
 * (architecture/rules/ui.md), so the administrator never loses the list they are
 * working from. The rule stays in `addMemberAction` → `AddSchoolMember`; this
 * component only decides when the dialog is up.
 */
export function AddMemberForm({ schoolId }: { schoolId: string }) {
  const [state, formAction] = useActionState<MemberActionState, FormData>(addMemberAction, {});
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  // Close on success by adjusting state during render rather than in an effect,
  // which would cascade an extra render. Closing unmounts the form, so the next
  // open starts from clean defaults with no explicit reset.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="glass-button rounded-full px-5 py-2 text-sm font-semibold text-foreground"
      >
        Adicionar membro
      </button>

      {open && (
        <Modal
          title="Adicionar membro"
          onClose={() => setOpen(false)}
          returnFocusTo={triggerRef}
          initialFocusTo={emailRef}
        >
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="schoolId" value={schoolId} />

            <div className="space-y-1.5">
              <label htmlFor="member-email" className="text-sm font-medium">
                E-mail da pessoa
              </label>
              <input
                ref={emailRef}
                id="member-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                placeholder="pessoa@exemplo.com"
                aria-describedby="member-email-hint"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
              <p id="member-email-hint" className="text-xs text-foreground/50">
                A pessoa precisa já ter uma conta Ryvano ativa. Para quem ainda não tem, use um
                convite.
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

            <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-4 py-2 text-sm text-foreground/60 hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              {/* "Adicionar", not "Adicionar membro": the trigger behind the
                  backdrop keeps that name, and two controls with the same
                  accessible name are ambiguous for screen readers. */}
              <SubmitButton
                pendingLabel="Adicionando…"
                className="glass-button rounded-full px-5 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
              >
                Adicionar
              </SubmitButton>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
