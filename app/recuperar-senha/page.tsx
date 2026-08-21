import Link from "next/link";

import { AuthLegal } from "@/components/auth/auth-legal";
import { RequestResetForm } from "@/components/auth/request-reset-form";
import { buildNoIndexMetadata } from "@/server/seo";
import { PublicPageShell } from "@/components/public-page-shell";
import { redirectIfAuthenticated } from "@/server/auth-guards";
import { hasPasswordResetEmailEnv } from "@/server/env";

export const metadata = buildNoIndexMetadata({
  title: "Recuperar senha",
  description: "Página de recuperação de senha da ryvano.",
  path: "/recuperar-senha",
});

export default async function RequestResetPage() {
  await redirectIfAuthenticated();

  const canSendEmail = hasPasswordResetEmailEnv();
  const description = canSendEmail
    ? "Informe seu e-mail e enviaremos as instruções para redefinir sua senha."
    : process.env.NODE_ENV !== "production"
      ? "Informe seu e-mail para gerar um link de redefinição neste ambiente."
      : "A recuperação por e-mail não está disponível neste ambiente no momento.";

  return (
    <PublicPageShell
      variant="auth"
      eyebrow="Segurança"
      title="Recuperar acesso"
      description={description}
      footer={
        <div className="space-y-4">
          <p className="text-center text-sm text-foreground/64">
            Voltar para <Link href="/entrar" className="text-accent hover:text-foreground">entrar</Link>
          </p>
          <AuthLegal />
        </div>
      }
    >
      <RequestResetForm deliveryMode={canSendEmail ? "email" : process.env.NODE_ENV !== "production" ? "dev-link" : "unavailable"} />
    </PublicPageShell>
  );
}
