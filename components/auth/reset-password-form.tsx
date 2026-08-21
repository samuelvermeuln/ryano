"use client";

import { useActionState } from "react";

import { resetPasswordAction, type ActionState } from "@/app/actions/auth";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? (
        <div className="rounded-[22px] border border-rose-300/18 bg-rose-300/8 px-4 py-3 text-sm text-rose-100">
          {state.message}
        </div>
      ) : null}

      <input type="hidden" name="token" value={token} />

      <PasswordField
        name="password"
        label="Nova senha"
        placeholder="Crie uma nova senha"
        autoComplete="new-password"
        required
        helperText="Use pelo menos 8 caracteres."
      />

      <SubmitButton className="glass-button-primary h-[52px] w-full rounded-2xl px-5 py-3 text-sm font-semibold" pendingLabel="Salvando...">
        Redefinir senha
      </SubmitButton>
    </form>
  );
}
