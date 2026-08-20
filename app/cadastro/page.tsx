import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import { buildNoIndexMetadata } from "@/server/seo";
import { PublicPageShell } from "@/components/public-page-shell";
import { redirectIfAuthenticated } from "@/server/auth-guards";

export const metadata = buildNoIndexMetadata({
  title: "Cadastro",
  description: "Página de criação de conta da RYANO.",
  path: "/cadastro",
});

export default async function SignupPage() {
  await redirectIfAuthenticated();

  return (
    <PublicPageShell
      eyebrow="Cadastro"
      title="Criar conta para iniciar jornada RYANO"
      description="Primeira etapa reduzida: nome, email e senha. Dados pessoais, endereço, Garmin e WhatsApp são concluídos no onboarding."
      footer={
        <p className="text-sm leading-7 text-foreground/62">
          Já possui conta? <Link href="/entrar" className="text-accent hover:text-foreground">Entrar agora</Link>
        </p>
      }
    >
      <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-foreground/72">
        Após criar conta, fluxo segue para login e onboarding com CPF, telefone, altura, peso, endereço, Garmin e ativação do WhatsApp.
      </div>
      <SignupForm />
    </PublicPageShell>
  );
}
