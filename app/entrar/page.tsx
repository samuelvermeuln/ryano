import { buildNoIndexMetadata } from "@/server/seo";
import { redirectIfAuthenticated } from "@/server/auth-guards";
import { hasGoogleOAuthEnv } from "@/server/env";
import { EntrarClient } from "./entrar-client";

export const metadata = buildNoIndexMetadata({
  title: "Entrar — Ryvano",
  description: "Acesse a plataforma esportiva como aluno, professor ou escola.",
  path: "/entrar",
});

function getAuthErrorMessage(error?: string): string | null {
  if (!error) return null;
  if (error === "AccessDenied") return "Não foi possível continuar com Google. Tente novamente.";
  if (error === "OAuthAccountNotLinked") return "Este e-mail já está vinculado a outro método de acesso. Entre com sua senha para continuar.";
  return "Não foi possível concluir seu acesso agora. Tente novamente.";
}

function getLoginHint(reason?: string): string | null {
  if (reason === "conta-existente") {
    return "Se estes dados já estiverem vinculados a uma conta sua, entre com o e-mail e a senha já utilizados. Se não lembrar sua senha ou seu e-mail, toque em recuperar acesso.";
  }
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; cadastro?: string; senha?: string; error?: string; motivo?: string }>;
}) {
  await redirectIfAuthenticated();

  const params = await searchParams;

  return (
    <EntrarClient
      googleEnabled={hasGoogleOAuthEnv()}
      initialMode={params.modo === "cadastro" ? "signup" : "login"}
      createdAccount={params.cadastro === "ok"}
      passwordChanged={params.senha === "alterada"}
      authError={getAuthErrorMessage(params.error)}
      loginHintMessage={getLoginHint(params.motivo)}
    />
  );
}
