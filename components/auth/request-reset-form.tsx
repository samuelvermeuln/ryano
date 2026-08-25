"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";

import { requestPasswordResetAction, type ActionState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

export function RequestResetForm({
  deliveryMode,
  initialIdentifier = "",
}: {
  deliveryMode: "email" | "dev-link" | "unavailable";
  initialIdentifier?: string;
}) {
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [state, formAction] = useActionState(requestPasswordResetAction, initialState);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    const expiresAtIso = state.resetCodeExpiresAt;

    if (!expiresAtIso) {
      return;
    }

    const updateRemainingSeconds = () => {
      const expiresAt = new Date(expiresAtIso).getTime();
      const nextValue = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemainingSeconds(nextValue);
    };

    updateRemainingSeconds();
    const interval = window.setInterval(updateRemainingSeconds, 1000);

    return () => window.clearInterval(interval);
  }, [state.resetCodeExpiresAt]);

  const resetPageHref = useMemo(() => {
    const recoveryIdentifier = state.recoveryIdentifier ?? identifier.trim();
    const params = new URLSearchParams();

    if (recoveryIdentifier) {
      params.set("identifier", recoveryIdentifier);
    }

    if (state.resetCodeExpiresAt) {
      params.set("expiresAt", state.resetCodeExpiresAt);
    }

    const query = params.toString();
    return query ? `/redefinir-senha?${query}` : "/redefinir-senha";
  }, [identifier, state.recoveryIdentifier, state.resetCodeExpiresAt]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="theme-panel-neutral rounded-[22px] border px-4 py-3 text-sm leading-7">
        <p className="font-medium text-foreground">Como recuperar sua conta</p>
        <ol className="mt-2 space-y-1 text-foreground/72">
          <li>1. Digite seu e-mail ou telefone.</li>
          <li>2. Vamos enviar um código para o e-mail cadastrado, se a conta existir.</li>
          <li>3. Abra o e-mail, copie o código e siga para a próxima etapa.</li>
        </ol>
      </div>

      {state.message ? (
        <div className="theme-panel-neutral rounded-[22px] border px-4 py-3 text-sm leading-7">
          <p>{state.message}</p>

          {remainingSeconds !== null ? (
            <p className="mt-2 text-sm font-medium text-foreground">Código válido por {formatRemainingTime(remainingSeconds)}.</p>
          ) : null}

          {state.resetCode ? (
            <div className="theme-panel-neutral mt-3 rounded-[18px] border px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-foreground/50">Código local de teste</p>
              <p className="mt-2 text-3xl font-semibold tracking-[0.3em] text-foreground">{state.resetCode}</p>
            </div>
          ) : null}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              href={resetPageHref}
              className="inline-flex items-center justify-center rounded-[16px] border border-white/10 px-4 py-2 text-xs font-semibold text-foreground hover:bg-white/8"
            >
              Digitar código agora
            </Link>
            <Link
              href="/entrar"
              className="inline-flex items-center justify-center rounded-[16px] border border-white/10 px-4 py-2 text-xs font-semibold text-foreground hover:bg-white/8"
            >
              Voltar para entrar
            </Link>
          </div>

          {state.resetUrl ? (
            <a href={state.resetUrl} className="mt-3 block break-all text-accent hover:text-foreground">
              {state.resetUrl}
            </a>
          ) : null}
        </div>
      ) : null}

      <label className="block space-y-2">
        <span className="text-[13px] font-medium text-foreground/76 sm:text-sm">E-mail ou telefone</span>
        <div className="glass-input rounded-2xl px-4 py-3">
          <input
            name="identifier"
            type="text"
            autoComplete="username"
            inputMode="text"
            placeholder="seu@email.com ou (27) 99999-9999"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            className="w-full bg-transparent text-[16px] text-foreground outline-none placeholder:text-foreground/40 sm:text-sm"
            required
          />
        </div>
        <p className="text-xs text-foreground/55">Pode usar o e-mail da conta ou telefone informado no cadastro.</p>
      </label>

      <SubmitButton className="glass-button-primary h-[52px] w-full rounded-2xl px-5 py-3 text-sm font-semibold" pendingLabel="Enviando código...">
        {deliveryMode === "email"
          ? "Enviar código"
          : deliveryMode === "dev-link"
            ? "Gerar código"
            : "Tentar recuperação"}
      </SubmitButton>
    </form>
  );
}

function formatRemainingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
