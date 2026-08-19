"use client";

import { useActionState } from "react";

import { resetPasswordAction, type ActionState } from "@/app/actions/auth";
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

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground/76">Nova senha</span>
        <div className="glass-input rounded-[20px] px-4 py-3">
          <input name="password" type="password" placeholder="Nova senha" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40" required />
        </div>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground/76">Confirmar nova senha</span>
        <div className="glass-input rounded-[20px] px-4 py-3">
          <input name="confirmPassword" type="password" placeholder="Repita nova senha" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40" required />
        </div>
      </label>

      <SubmitButton className="glass-button-primary w-full rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Salvando...">
        Redefinir senha
      </SubmitButton>
    </form>
  );
}
