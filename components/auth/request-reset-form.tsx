"use client";

import { useActionState } from "react";

import { requestPasswordResetAction, type ActionState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

export function RequestResetForm({
  deliveryMode,
}: {
  deliveryMode: "email" | "dev-link" | "unavailable";
}) {
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
        <span className="text-[13px] font-medium text-foreground/76 sm:text-sm">E-mail</span>
        <div className="glass-input rounded-2xl px-4 py-3">
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="seu@email.com"
            className="w-full bg-transparent text-[16px] text-foreground outline-none placeholder:text-foreground/40 sm:text-sm"
            required
          />
        </div>
      </label>

      <SubmitButton className="glass-button-primary h-[52px] w-full rounded-2xl px-5 py-3 text-sm font-semibold" pendingLabel="Processando...">
        {deliveryMode === "email"
          ? "Enviar instruções por email"
          : deliveryMode === "dev-link"
            ? "Gerar link de redefinição"
            : "Tentar recuperação"}
      </SubmitButton>
    </form>
  );
}
