"use client";

import { useActionState } from "react";

import { requestPasswordResetAction, type ActionState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

export function RequestResetForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? (
        <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-foreground/76">
          <p>{state.message}</p>
          {state.resetUrl ? (
            <a href={state.resetUrl} className="mt-2 block break-all text-accent hover:text-foreground">
              {state.resetUrl}
            </a>
          ) : null}
        </div>
      ) : null}

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground/76">Email</span>
        <div className="glass-input rounded-[20px] px-4 py-3">
          <input name="email" type="email" placeholder="voce@exemplo.com" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40" required />
        </div>
      </label>

      <SubmitButton className="glass-button-primary w-full rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Gerando link...">
        Gerar link de redefinição
      </SubmitButton>
    </form>
  );
}
