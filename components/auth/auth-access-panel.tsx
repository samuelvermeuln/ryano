"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { loginAction, signupAction, type ActionState } from "@/app/actions/auth";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/submit-button";

type AuthMode = "login" | "signup";

type AuthAccessPanelProps = {
  googleEnabled: boolean;
  initialMode: AuthMode;
  createdAccount: boolean;
  passwordChanged: boolean;
  authError?: string | null;
  loginHintMessage?: string | null;
  /** Where to redirect after credentials login. Defaults to "/entrar". */
  callbackUrl?: string;
  /**
   * Where to redirect after Google OAuth. When omitted, falls back to callbackUrl.
   * Use /entrar?next=<dest> so the redirect always lands on the trusted sign-in
   * page first and is forwarded server-side — more reliable than a raw path.
   */
  googleCallbackUrl?: string;
};

const initialState: ActionState = {};

function Alert({
  tone,
  children,
}: {
  tone: "success" | "error" | "neutral";
  children: ReactNode;
}) {
  const toneClassName =
    tone === "success"
      ? "theme-panel-success"
      : tone === "error"
        ? "theme-panel-danger"
        : "theme-panel-neutral";

  return <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClassName}`}>{children}</div>;
}

export function AuthAccessPanel({
  googleEnabled,
  initialMode,
  createdAccount,
  passwordChanged,
  authError,
  loginHintMessage,
  callbackUrl = "/entrar",
  googleCallbackUrl: googleCbUrl,
}: AuthAccessPanelProps) {
  const effectiveGoogleCallbackUrl = googleCbUrl ?? callbackUrl;
  const loginPasswordRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginHint, setLoginHint] = useState<string | null>(null);
  const [loginState, loginFormAction, loginPending] = useActionState(loginAction, initialState);
  const [state, formAction] = useActionState(signupAction, initialState);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setLoginHint(null);

    if (nextMode === "signup" && !registerEmail && loginEmail) {
      setRegisterEmail(loginEmail);
    }

    if (nextMode === "login" && !loginEmail && registerEmail) {
      setLoginEmail(registerEmail);
    }
  }

  useEffect(() => {
    if (state.code !== "ACCOUNT_ALREADY_EXISTS") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMode("login");
      setLoginEmail(registerEmail);
      setLoginHint("Encontramos uma conta com estes dados. Digite sua senha para continuar ou toque em recuperar acesso se não lembrar.");
      loginPasswordRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [registerEmail, state.code]);

  const sharedAlerts = [
    createdAccount ? <Alert key="created" tone="success">Conta criada com sucesso.</Alert> : null,
    passwordChanged ? <Alert key="password" tone="success">Senha redefinida com sucesso.</Alert> : null,
    authError ? <Alert key="auth-error" tone="error">{authError}</Alert> : null,
    loginHintMessage ? (
      <Alert key="login-hint" tone="neutral">
        <p>{loginHintMessage}</p>
        <div className="mt-2">
          <Link href="/recuperar-senha" className="text-sm font-medium text-accent hover:text-foreground">
            Recuperar acesso
          </Link>
        </div>
      </Alert>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      {sharedAlerts.length > 0 ? <div className="space-y-3">{sharedAlerts}</div> : null}

      {googleEnabled ? <GoogleSignInButton callbackUrl={effectiveGoogleCallbackUrl} /> : null}

      {googleEnabled ? (
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-foreground/42">
          <span className="h-px flex-1 bg-white/10" />
          <span>ou continue com</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
      ) : null}

      <div className="glass rounded-[18px] p-1" role="tablist" aria-label="Modo de acesso">
        <div className="grid grid-cols-2 gap-1">
          {([
            ["login", "Entrar"],
            ["signup", "Criar conta"],
          ] as const).map(([value, label]) => {
            const active = mode === value;

            return (
              <button
                key={value}
                id={`auth-tab-${value}`}
                role="tab"
                aria-selected={active}
                aria-controls={`auth-panel-${value}`}
                type="button"
                onClick={() => switchMode(value)}
                className={`relative rounded-[14px] px-4 py-3 text-sm font-medium transition ${
                  active ? "text-foreground" : "text-foreground/55"
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="auth-mode-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
                    className="absolute inset-0 rounded-[14px] bg-[linear-gradient(135deg,rgba(133,221,255,0.2),rgba(88,205,170,0.2))]"
                  />
                ) : null}
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-[332px]">
        <AnimatePresence mode="wait" initial={false}>
          {mode === "login" ? (
            <motion.div
              key="login"
              id="auth-panel-login"
              role="tabpanel"
              aria-labelledby="auth-tab-login"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="space-y-5"
            >
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">Bem-vindo de volta</h2>
                <p className="text-sm leading-7 text-foreground/68">
                  Entre para continuar acompanhando seus treinos e evolução.
                </p>
              </div>

              {loginHint ? (
                <Alert tone="neutral">
                  <p>{loginHint}</p>
                  <div className="mt-2">
                    <Link href="/recuperar-senha" className="text-sm font-medium text-accent hover:text-foreground">
                      Recuperar senha
                    </Link>
                  </div>
                </Alert>
              ) : null}
              {loginState.message ? <Alert tone="error">{loginState.message}</Alert> : null}

              <form action={loginFormAction} className="space-y-4">
                <input type="hidden" name="callbackUrl" value={callbackUrl} />
                <label className="block space-y-2">
                  <span className="text-[13px] font-medium text-foreground/76 sm:text-sm">E-mail</span>
                  <div className="glass-input rounded-2xl px-4 py-3">
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="seu@email.com"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      className="w-full bg-transparent text-[16px] text-foreground outline-none placeholder:text-foreground/40 sm:text-sm"
                      required
                    />
                  </div>
                </label>

                <PasswordField
                  ref={loginPasswordRef}
                  name="password"
                  label="Senha"
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={setLoginPassword}
                  required
                  trailingLabel={
                    <Link href="/recuperar-senha" className="hover:text-foreground">
                      Esqueci minha senha
                    </Link>
                  }
                />

                <button
                  type="submit"
                  disabled={loginPending}
                  className="glass-button-primary h-[52px] w-full rounded-2xl px-5 py-3 text-sm font-semibold"
                >
                  {loginPending ? "Entrando..." : "Entrar"}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="signup"
              id="auth-panel-signup"
              role="tabpanel"
              aria-labelledby="auth-tab-signup"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="space-y-5"
            >
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">Crie sua conta</h2>
                <p className="text-sm leading-7 text-foreground/68">
                  Comece agora e receba seus resumos esportivos em um só lugar.
                </p>
              </div>

              {state.message && !state.success ? <Alert tone="error">{state.message}</Alert> : null}

              <form action={formAction} className="space-y-4">
                <input type="hidden" name="callbackUrl" value={callbackUrl} />
                <label className="block space-y-2">
                  <span className="text-[13px] font-medium text-foreground/76 sm:text-sm">Nome</span>
                  <div className="glass-input rounded-2xl px-4 py-3">
                    <input
                      name="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Seu nome"
                      value={registerName}
                      onChange={(event) => setRegisterName(event.target.value)}
                      className="w-full bg-transparent text-[16px] text-foreground outline-none placeholder:text-foreground/40 sm:text-sm"
                      required
                      aria-invalid={state.fields?.name ? "true" : undefined}
                    />
                  </div>
                  {state.fields?.name ? <p className="text-xs text-rose-200">{state.fields.name}</p> : null}
                </label>

                <label className="block space-y-2">
                  <span className="text-[13px] font-medium text-foreground/76 sm:text-sm">E-mail</span>
                  <div className="glass-input rounded-2xl px-4 py-3">
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="seu@email.com"
                      value={registerEmail}
                      onChange={(event) => setRegisterEmail(event.target.value)}
                      className="w-full bg-transparent text-[16px] text-foreground outline-none placeholder:text-foreground/40 sm:text-sm"
                      required
                      aria-invalid={state.fields?.email ? "true" : undefined}
                    />
                  </div>
                  {state.fields?.email ? <p className="text-xs text-rose-200">{state.fields.email}</p> : null}
                </label>

                <PasswordField
                  name="password"
                  label="Senha"
                  placeholder="Crie uma senha"
                  autoComplete="new-password"
                  value={registerPassword}
                  onChange={setRegisterPassword}
                  required
                  helperText={state.fields?.password ? undefined : "Use pelo menos 8 caracteres."}
                  error={state.fields?.password}
                />

                <SubmitButton
                  className="glass-button-primary h-[52px] w-full rounded-2xl px-5 py-3 text-sm font-semibold"
                  pendingLabel="Criando sua conta..."
                >
                  Criar minha conta
                </SubmitButton>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
