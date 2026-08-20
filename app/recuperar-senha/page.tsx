import Link from "next/link";

import { RequestResetForm } from "@/components/auth/request-reset-form";
import { buildNoIndexMetadata } from "@/server/seo";
import { PublicPageShell } from "@/components/public-page-shell";
import { redirectIfAuthenticated } from "@/server/auth-guards";
import { hasPasswordResetEmailEnv } from "@/server/env";

export const metadata = buildNoIndexMetadata({
  title: "Recuperar senha",
  description: "Página de recuperação de senha da RYANO.",
  path: "/recuperar-senha",
});

export default async function RequestResetPage() {
  await redirectIfAuthenticated();

  const canSendEmail = hasPasswordResetEmailEnv();
  const description = canSendEmail
    ? "Informe seu email para receber instruções reais de redefinição de senha."
    : process.env.NODE_ENV !== "production"
      ? "Email transacional não está configurado neste ambiente. Em desenvolvimento, o link é disponibilizado localmente com transparência."
      : "Recuperação por email não está configurada neste ambiente.";

  return (
    <PublicPageShell
      eyebrow="Segurança"
      title="Recuperar acesso"
      description={description}
      footer={
        <p className="text-sm leading-7 text-foreground/62">
          Voltar para <Link href="/entrar" className="text-accent hover:text-foreground">entrar</Link>
        </p>
      }
    >
      <RequestResetForm deliveryMode={canSendEmail ? "email" : process.env.NODE_ENV !== "production" ? "dev-link" : "unavailable"} />
    </PublicPageShell>
  );
}
