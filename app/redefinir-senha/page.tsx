import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { PublicPageShell } from "@/components/public-page-shell";

export const metadata = {
  title: "Redefinir senha",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";

  return (
    <PublicPageShell
      eyebrow="Segurança"
      title="Definir nova senha"
      description="Use token gerado no fluxo de recuperação. Tokens são de uso único e possuem expiração."
      footer={
        <p className="text-sm leading-7 text-foreground/62">
          Voltar para <Link href="/entrar" className="text-accent hover:text-foreground">entrar</Link>
        </p>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="rounded-[22px] border border-rose-300/18 bg-rose-300/8 px-4 py-3 text-sm text-rose-100">
          Token ausente.
        </div>
      )}
    </PublicPageShell>
  );
}
