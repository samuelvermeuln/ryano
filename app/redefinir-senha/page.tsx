import Link from "next/link";

import { AuthLegal } from "@/components/auth/auth-legal";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { buildNoIndexMetadata } from "@/server/seo";
import { PublicPageShell } from "@/components/public-page-shell";
import { redirectIfAuthenticated } from "@/server/auth-guards";
import { readPasswordResetAccessToken } from "@/server/utils/password-reset-access";

export const metadata = buildNoIndexMetadata({
  title: "Redefinir senha",
  description: "Página de redefinição de senha da ryvano.",
  path: "/redefinir-senha",
});

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; identifier?: string; expiresAt?: string; code?: string; acesso?: string }>;
}) {
  await redirectIfAuthenticated();

  const params = await searchParams;
  const token = params.token ?? "";
  const access = params.acesso ? readPasswordResetAccessToken(params.acesso) : null;
  const identifier = access?.identifier ?? params.identifier ?? "";
  const expiresAt = access?.expiresAt ?? params.expiresAt ?? "";
  const code = access?.code ?? params.code ?? "";

  return (
    <PublicPageShell
      variant="auth"
      eyebrow="Segurança"
      title={token ? "Crie uma nova senha" : "Digite o código e crie nova senha"}
      description={token ? "Defina uma nova senha para voltar a acompanhar seus treinos normalmente." : "Abra o e-mail recebido, copie o código de 6 números e digite-o abaixo para criar sua nova senha."}
      footer={
        <div className="space-y-4">
          <p className="text-center text-sm text-foreground/64">
            Voltar para <Link href="/entrar" className="text-accent hover:text-foreground">entrar</Link>
          </p>
          <AuthLegal />
        </div>
      }
    >
      <ResetPasswordForm
        token={token || undefined}
        identifier={identifier}
        codeExpiresAt={expiresAt || undefined}
        prefilledCode={code || undefined}
        lockIdentifier={Boolean(access?.identifier)}
      />
    </PublicPageShell>
  );
}
