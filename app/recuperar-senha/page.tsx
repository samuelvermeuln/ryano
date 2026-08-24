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

function getRecoveryDescription(canSendEmail: boolean, reason?: string) {
  if (!canSendEmail && process.env.NODE_ENV === "production") {
    return "A recuperação por e-mail não está disponível neste ambiente no momento.";
  }

  if (reason === "conta-existente") {
    return canSendEmail
      ? "Se você já teve uma conta com estes dados, informe seu e-mail ou telefone. Enviaremos as instruções para o e-mail cadastrado, sem expor informações da conta."
      : "Informe seu e-mail ou telefone para gerar um link de redefinição neste ambiente.";
  }

  return canSendEmail
    ? "Informe seu e-mail ou telefone e enviaremos as instruções para redefinir sua senha."
    : "Informe seu e-mail ou telefone para gerar um link de redefinição neste ambiente.";
}

export default async function RequestResetPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string; identificador?: string }>;
}) {
  await redirectIfAuthenticated();

  const params = await searchParams;
  const canSendEmail = hasPasswordResetEmailEnv();
  const description = getRecoveryDescription(canSendEmail, params.motivo);

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
      <RequestResetForm
        deliveryMode={canSendEmail ? "email" : process.env.NODE_ENV !== "production" ? "dev-link" : "unavailable"}
        initialIdentifier={params.identificador ?? ""}
      />
    </PublicPageShell>
  );
}
