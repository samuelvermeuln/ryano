"use client";

import { useActionState } from "react";

import { changePasswordAction, type ActionState } from "@/app/actions/profile";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? (
        <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">
          {state.message}
        </div>
      ) : null}

      <Field label="Senha atual" name="currentPassword" />
      <Field label="Nova senha" name="password" />
      <Field label="Confirmar nova senha" name="confirmPassword" />

      <SubmitButton className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Atualizando senha...">
        Atualizar senha
      </SubmitButton>
    </form>
  );
}

function Field({ label, name }: { label: string; name: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input rounded-[20px] px-4 py-3">
        <input name={name} type="password" className="w-full bg-transparent text-sm text-foreground outline-none" required />
      </div>
    </label>
  );
}
