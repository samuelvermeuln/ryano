import { AuthAccessPanel } from "@/components/auth/auth-access-panel";
import { AuthLegal } from "@/components/auth/auth-legal";
import { buildNoIndexMetadata } from "@/server/seo";
import { PublicPageShell } from "@/components/public-page-shell";
import { redirectIfAuthenticated } from "@/server/auth-guards";
import { hasGoogleOAuthEnv } from "@/server/env";

export const metadata = buildNoIndexMetadata({
  title: "Entrar",
  description: "Página de autenticação da ryvano.",
  path: "/entrar",
});

function getAuthErrorMessage(error?: string) {
  if (!error) {
    return null;
  }

  if (error === "AccessDenied") {
    return "Não foi possível continuar com Google. Tente novamente.";
  }

  if (error === "OAuthAccountNotLinked") {
    return "Este e-mail já está vinculado a outro método de acesso. Entre com sua senha para continuar.";
  }

  return "Não foi possível concluir seu acesso agora. Tente novamente.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; cadastro?: string; senha?: string; error?: string }>;
}) {
  await redirectIfAuthenticated();

  const params = await searchParams;
  return (
    <PublicPageShell
      variant="auth"
      eyebrow="Acesso"
      title="Continue para seus treinos"
      description="Acesse suas atividades, evolução e relatórios esportivos em um só lugar."
      footer={<AuthLegal />}
    >
      <AuthAccessPanel
        googleEnabled={hasGoogleOAuthEnv()}
        initialMode={params.modo === "cadastro" ? "signup" : "login"}
        createdAccount={params.cadastro === "ok"}
        passwordChanged={params.senha === "alterada"}
        authError={getAuthErrorMessage(params.error)}
      />
    </PublicPageShell>
  );
}
