import { redirect } from "next/navigation";

import { buildNoIndexMetadata } from "@/server/seo";
import { auth } from "@/server/auth";
import { getAuthenticatedRedirectPath, resolveSmartLandingPath } from "@/server/auth-guards";
import { hasGoogleOAuthEnv } from "@/server/env";
import { parseSafeMarketplaceCallbackPath } from "@/modules/school/domain/marketplace-callback-url";
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
  if (SAFE_NEXT_PATHS.has(decoded)) return decoded;
  // TM037 (RF-107) — Google OAuth's `?next=` wrapper (see `googleCallbackUrl`
  // in entrar-client.tsx) also carries the marketplace buyer's return path
  // when the "aluno" role's callbackUrl was overridden by `buyerCallbackUrl`.
  // Validated the same way as the credentials-login `callbackUrl` below —
  // never by widening this allowlist to arbitrary paths.
  return parseSafeMarketplaceCallbackPath(decoded);
}

/**
 * TM037 (RF-107) — the marketplace buyer entry point. Distinct from
 * `getSafeNext` above (a small fixed allowlist of role landing pages): a
 * buyer needs to come back to the exact product page they were trying to
 * buy, which is not a small fixed set, so it is validated by shape
 * (`isSafeMarketplaceCallbackPath` — internal, `/marketplace/`-scoped only)
 * instead of by membership in an allowlist. An external value (e.g.
 * `https://evil.example.com`) is rejected outright — this function never
 * returns it. Failing the check does not fail the page: it simply falls back
 * to the ordinary role-picker flow with no buyer callback.
 */
function getSafeMarketplaceCallback(raw: string | undefined): string | null {
  if (!raw) return null;
  return parseSafeMarketplaceCallbackPath(decodeURIComponent(raw));
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
  searchParams: Promise<{
    modo?: string; cadastro?: string; senha?: string; error?: string; motivo?: string; next?: string;
    /** TM037 (RF-107) — where a marketplace buyer CTA sends an anonymous visitor to log in. */
    callbackUrl?: string;
  }>;
}) {
  const params = await searchParams;
  const nextPath = getSafeNext(params.next);
  const marketplaceCallbackUrl = getSafeMarketplaceCallback(params.callbackUrl);

  // If the user is already authenticated (returned here via OAuth callbackUrl,
  // or already had a session open in this tab) and there's a validated return
  // target, send them there directly instead of showing the role picker.
  const session = await auth();
  if (session?.user?.id) {
    if (marketplaceCallbackUrl) {
      redirect(marketplaceCallbackUrl);
    }
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
      buyerCallbackUrl={marketplaceCallbackUrl}
    />
  );
}
