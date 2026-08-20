import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { PublicPageShell } from "@/components/public-page-shell";
import { redirectIfAuthenticated } from "@/server/auth-guards";
import { hasGoogleOAuthEnv } from "@/server/env";

export const metadata = {
  title: "Entrar",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ cadastro?: string; senha?: string }>;
}) {
  await redirectIfAuthenticated();

  const params = await searchParams;
  return (
    <PublicPageShell
      eyebrow="Acesso"
      title="Entrar na sua conta RYANO"
      description="Login por email e senha via Auth.js. Google OAuth aparece quando credenciais estiverem configuradas no ambiente."
      footer={
        <p className="text-sm leading-7 text-foreground/62">
          Ainda sem conta? <Link href="/cadastro" className="text-accent hover:text-foreground">Criar cadastro</Link>
        </p>
      }
    >
      <LoginForm
        googleEnabled={hasGoogleOAuthEnv()}
        createdAccount={params.cadastro === "ok"}
        passwordChanged={params.senha === "alterada"}
      />
    </PublicPageShell>
  );
}
