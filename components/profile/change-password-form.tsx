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
        <div className={`rounded-[22px] border px-4 py-3 text-sm ${state.success ? "theme-panel-success" : "theme-panel-danger"}`}>
          {state.message}
        </div>
      ) : null}

      <Field label="Senha atual" name="currentPassword" />
      <Field label="Nova senha" name="password" helper="Use pelo menos 8 caracteres, com letra e número." />
      <Field label="Confirmar nova senha" name="confirmPassword" />

      <SubmitButton className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Atualizando senha...">
        Atualizar senha
      </SubmitButton>
    </form>
  );
}

function Field({ label, name, helper }: { label: string; name: string; helper?: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="flex min-h-[50px] items-center rounded-[16px] border border-white/10 bg-white/[0.045] px-4 transition hover:border-white/14 focus-within:border-cyan-300/40 focus-within:ring-2 focus-within:ring-cyan-300/16">
        <input name={name} type="password" className="w-full bg-transparent text-sm text-foreground outline-none" required />
      </div>
      {helper ? <p className="text-xs text-foreground/48">{helper}</p> : null}
    </label>
  );
}
