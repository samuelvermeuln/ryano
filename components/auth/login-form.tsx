"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

export function LoginForm({
  googleEnabled,
  createdAccount,
  passwordChanged,
}: {
  googleEnabled: boolean;
  createdAccount: boolean;
  passwordChanged: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const result = await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirect: false,
      callbackUrl: "/app/dashboard",
    });

    setPending(false);

    if (!result?.ok) {
      setError("Credenciais inválidas ou conta bloqueada.");
      return;
    }

    router.push(result.url ?? "/app/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {createdAccount ? (
        <div className="rounded-[22px] border border-emerald-300/18 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">
          Conta criada. Faça login para continuar.
        </div>
      ) : null}
      {passwordChanged ? (
        <div className="rounded-[22px] border border-emerald-300/18 bg-emerald-300/8 px-4 py-3 text-sm text-emerald-100">
          Senha redefinida com sucesso.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-[22px] border border-rose-300/18 bg-rose-300/8 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <form action={handleSubmit} className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground/76">Email</span>
          <div className="glass-input rounded-[20px] px-4 py-3">
            <input
              name="email"
              type="email"
              placeholder="voce@exemplo.com"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
              required
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground/76">Senha</span>
          <div className="glass-input rounded-[20px] px-4 py-3">
            <input
              name="password"
              type="password"
              placeholder="Sua senha"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
              required
            />
          </div>
        </label>

        <div className="flex items-center justify-between gap-3 text-sm text-foreground/62">
          <a href="/cadastro" className="hover:text-foreground">
            Criar conta
          </a>
          <a href="/recuperar-senha" className="hover:text-foreground">
            Esqueci minha senha
          </a>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="glass-button-primary w-full rounded-[20px] px-5 py-3 text-sm font-semibold"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {googleEnabled ? <GoogleSignInButton /> : null}
    </div>
  );
}
