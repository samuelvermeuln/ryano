import { redirect } from "next/navigation";

import { buildNoIndexMetadata } from "@/server/seo";
import { auth } from "@/server/auth";
import { getAuthenticatedRedirectPath, resolveSmartLandingPath } from "@/server/auth-guards";
import { hasGoogleOAuthEnv } from "@/server/env";
import { EntrarClient } from "./entrar-client";

export const metadata = buildNoIndexMetadata({
  title: "Entrar — Ryvano",
  description: "Acesse a plataforma esportiva como aluno, professor ou escola.",
  path: "/entrar",
});

// Allowlist for ?next= redirect targets — prevents open-redirect
const SAFE_NEXT_PATHS = new Set(["/professor", "/escola", "/escola/criar", "/app/dashboard"]);

function getSafeNext(raw: string | undefined): string | null {
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  return SAFE_NEXT_PATHS.has(decoded) ? decoded : null;
}

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
  searchParams: Promise<{ modo?: string; cadastro?: string; senha?: string; error?: string; motivo?: string; next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = getSafeNext(params.next);

  // If the user is already authenticated (returned here via OAuth callbackUrl)
  // and there's a validated ?next= param, send them there directly.
  const session = await auth();
  if (session?.user?.id) {
    if (nextPath) {
      redirect(nextPath);
    }

    const fallback = getAuthenticatedRedirectPath(session);

    // No explicit next: for the plain "aluno" fallback, check whether the
    // account actually runs a school or has a coach profile so returning
    // users land on the right view automatically instead of always seeing
    // the student dashboard. ADMIN and pending-onboarding destinations are
    // untouched — this only kicks in when the fallback is /app/dashboard.
    if (fallback === "/app/dashboard") {
      const smartDestination = await resolveSmartLandingPath(session);
      redirect(smartDestination ?? fallback);
    }

    if (fallback) redirect(fallback);
  }

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
