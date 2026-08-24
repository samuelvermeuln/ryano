"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { connectGarminAction, type ActionState } from "@/app/actions/integrations";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

function ConnectLogo() {
  return (
    <span className="select-none text-2xl font-light tracking-[0.15em] text-brand-foreground">
      c<span className="tracking-[0.12em]">onnect</span>
    </span>
  );
}

type GarminScreenProps = {
  connection?: {
    status: string;
    lastSyncAt: Date | null;
    lastSyncStatus: string | null;
  } | null;
  fullHeight?: boolean;
  onSuccess?: () => void;
};

export function GarminScreen({ connection, fullHeight = false, onSuccess }: GarminScreenProps) {
  void connection;

  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction] = useActionState(connectGarminAction, initialState);
  const recoverPasswordUrl = process.env.GARMIN_RECOVER_PASSWORD_URL || "#";
  const createAccountUrl = process.env.GARMIN_CREATE_USER_URL || "#";

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.refresh();
    onSuccess?.();
  }, [onSuccess, router, state.success]);

  return (
    <div className={`flex flex-col bg-background ${fullHeight ? "h-full min-h-0" : "min-h-screen"}`}>
      <header className="bg-brand px-4 py-3 md:px-6 md:py-4">
        <div className="flex justify-center md:justify-start">
          <ConnectLogo />
        </div>
      </header>

      <main className="relative flex flex-1 flex-col overflow-y-auto md:items-center md:justify-start">
        <Image
          src="/bg_run.png"
          alt="Corredor em trilha de montanha"
          width={1920}
          height={1088}
          className="absolute inset-0 hidden h-full w-full object-cover md:block"
          priority
        />

        <div className="relative z-10 w-full bg-card px-4 pb-10 pt-6 md:mt-14 md:max-w-lg md:px-10 md:py-8 md:shadow-lg">
          <h1 className="bg-muted px-1 text-3xl font-normal text-foreground md:bg-transparent md:px-0">Login</h1>
          <hr className="mt-4 border-border" />

          <form action={formAction} className="mt-6 space-y-5">
            {state.message ? (
              <div className="rounded-sm border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">{state.message}</div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-bold text-foreground">
                Endereço de e-mail <span className="text-destructive">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                className="h-11 w-full rounded-sm border border-input bg-background px-3 text-base text-foreground outline-none focus:border-ring"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-bold text-foreground">
                Senha <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="h-11 w-full rounded-sm border border-input bg-background px-3 pr-24 text-base text-foreground outline-none focus:border-ring"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-foreground underline"
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label className="flex min-w-0 items-center gap-2 text-base text-foreground">
                <input type="checkbox" className="h-5 w-5 shrink-0 rounded-none border border-input accent-brand" />
                Lembrar-me
              </label>
              <Link href={recoverPasswordUrl} className="shrink-0 text-base text-foreground underline">
                Esqueceu a senha?
              </Link>
            </div>

            <SubmitButton
              className="mt-4 h-11 w-full rounded-sm bg-primary text-base text-primary-foreground transition-colors hover:bg-primary/90"
              pendingLabel="Conectando Garmin..."
            >
              Login
            </SubmitButton>
          </form>

          <p className="mt-4 text-center text-base text-foreground">
            Você não tem conta? <Link href={createAccountUrl} className="underline">Crie uma</Link>
          </p>
        </div>
      </main>

      <footer className="hidden bg-brand px-6 py-4 md:block">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-semibold text-brand-foreground">
          <p>Copyright © 1996-2026 Garmin Ltd. ou suas subsidiárias</p>
          <nav className="flex flex-wrap gap-6">
            <a>Termos de uso</a>
            <a>Política de privacidade</a>
            <a>Segurança</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
