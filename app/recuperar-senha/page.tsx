import Link from "next/link";

import { RequestResetForm } from "@/components/auth/request-reset-form";
import { PublicPageShell } from "@/components/public-page-shell";

export const metadata = {
  title: "Recuperar senha",
};

export default function RequestResetPage() {
  return (
    <PublicPageShell
      eyebrow="Segurança"
      title="Gerar redefinição de senha"
      description="Email transacional ainda não foi configurado neste projeto. Em desenvolvimento, o link é disponibilizado localmente com transparência."
      footer={
        <p className="text-sm leading-7 text-foreground/62">
          Voltar para <Link href="/entrar" className="text-accent hover:text-foreground">entrar</Link>
        </p>
      }
    >
      <RequestResetForm />
    </PublicPageShell>
  );
}
