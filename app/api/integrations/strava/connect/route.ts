import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { assertRateLimit, isRateLimitError } from "@/server/rate-limit";
import {
  buildStravaAuthorizeUrl,
  createStravaOAuthState,
  hasStravaOAuthEnv,
} from "@/modules/strava";
import { isProviderEnabled } from "@/modules/shared/integrations/catalog";

/**
 * Início do fluxo OAuth do Strava (adapter fino — Task 5.5, Req 10.1, 13.7).
 *
 * `GET` que responde com um redirect (302) para a authorize URL do Strava. A UI
 * genérica de Integrações apenas navega até esta rota; não conhece nenhum
 * detalhe de OAuth (Req 13.7).
 *
 * Passos: exige sessão → veda providers não habilitados (`isProviderEnabled`) →
 * exige env de OAuth configurado → rate-limit por usuário → gera `state`
 * assinado → monta a authorize URL → redireciona. Qualquer falha volta para
 * `/app/integracoes` com um indicador de erro genérico (sem segredos).
 */
export async function GET(request: Request) {
  const integrationsUrl = (params?: Record<string, string>) => {
    const url = new URL("/app/integracoes", request.url);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url;
  };

  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Não iniciar um fluxo real de conexão para um provider indisponível/desabilitado.
  if (!isProviderEnabled("STRAVA")) {
    return NextResponse.redirect(
      integrationsUrl({ strava: "error", reason: "unavailable" }),
    );
  }

  // Sem credenciais de OAuth configuradas, não há como montar a authorize URL.
  if (!hasStravaOAuthEnv()) {
    return NextResponse.redirect(
      integrationsUrl({ strava: "error", reason: "not_configured" }),
    );
  }

  try {
    await assertRateLimit(`api-strava-connect:${session.user.id}`, 5, 1000 * 60 * 10);

    const state = createStravaOAuthState(session.user.id);
    const authorizeUrl = buildStravaAuthorizeUrl({ state });

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    if (isRateLimitError(error)) {
      return NextResponse.redirect(
        integrationsUrl({ strava: "error", reason: "rate_limited" }),
      );
    }

    // Config ausente (client id/callback) ou falha inesperada: nunca vaza detalhes.
    return NextResponse.redirect(
      integrationsUrl({ strava: "error", reason: "connect_failed" }),
    );
  }
}
