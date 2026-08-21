import Link from "next/link";

import { AuthLegal } from "@/components/auth/auth-legal";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { buildNoIndexMetadata } from "@/server/seo";
import { PublicPageShell } from "@/components/public-page-shell";
import { redirectIfAuthenticated } from "@/server/auth-guards";

export const metadata = buildNoIndexMetadata({
  title: "Redefinir senha",
  description: "Página de redefinição de senha da ryvano.",
  path: "/redefinir-senha",
});

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await redirectIfAuthenticated();

  const params = await searchParams;
  const token = params.token ?? "";

  return (
    <PublicPageShell
      variant="auth"
      eyebrow="Segurança"
      title="Crie uma nova senha"
      description="Defina uma nova senha para voltar a acompanhar seus treinos normalmente."
      footer={
        <div className="space-y-4">
          <p className="text-center text-sm text-foreground/64">
            Voltar para <Link href="/entrar" className="text-accent hover:text-foreground">entrar</Link>
          </p>
          <AuthLegal />
        </div>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="rounded-[22px] border border-rose-300/18 bg-rose-300/8 px-4 py-3 text-sm text-rose-100">
          Link inválido ou expirado. Solicite uma nova redefinição de senha.
        </div>
      )}
    </PublicPageShell>
  );
}
