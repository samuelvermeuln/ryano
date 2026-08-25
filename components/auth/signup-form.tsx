"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { signupAction, type ActionState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

export function SignupForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(signupAction, initialState);

  useEffect(() => {
    if (state.success) {
      const timeout = setTimeout(() => {
        router.push("/entrar?cadastro=ok");
        router.refresh();
      }, 800);

      return () => clearTimeout(timeout);
    }
  }, [router, state.success]);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state.message ? (
        <div
          className={`rounded-[22px] border px-4 py-3 text-sm ${
            state.success ? "theme-panel-success" : "theme-panel-danger"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground/76">Nome completo</span>
        <div className="glass-input rounded-[20px] px-4 py-3">
          <input name="name" type="text" placeholder="Seu nome" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40" required />
        </div>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground/76">E-mail</span>
        <div className="glass-input rounded-[20px] px-4 py-3">
          <input name="email" type="email" placeholder="voce@exemplo.com" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40" required />
        </div>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground/76">Senha</span>
          <div className="glass-input rounded-[20px] px-4 py-3">
            <input name="password" type="password" placeholder="Mínimo 8 caracteres" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40" required />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground/76">Confirmar senha</span>
          <div className="glass-input rounded-[20px] px-4 py-3">
            <input name="confirmPassword" type="password" placeholder="Repita senha" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40" required />
          </div>
        </label>
      </div>

      <SubmitButton className="glass-button-primary w-full rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Criando conta...">
        Criar conta
      </SubmitButton>
    </form>
  );
}
