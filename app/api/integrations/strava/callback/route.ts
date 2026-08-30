import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { auth } from "@/server/auth";
import {
  exchangeStravaCode,
  syncStravaForUser,
  verifyStravaOAuthState,
} from "@/modules/strava";
import { logger } from "@/server/logging/logger";
import { getPublicAppUrl } from "@/server/env";

/**
 * Callback OAuth do Strava (adapter fino — Task 5.5, Req 10.1, 13.7).
 *
 * O Strava redireciona o usuário para cá com `code`, `scope` e `state` em caso
 * de sucesso, ou `error=access_denied` se o usuário negou o consentimento.
 *
 * Fonte-de-verdade do usuário: o `state` assinado (Task 5.2). O redirect de
 * volta pode não carregar a sessão de forma confiável, então o `userId` vem do
 * `state` verificado; se houver sessão ativa, fazemos uma verificação cruzada
 * defensiva, mas nunca exigimos sessão no callback.
 *
 * Nunca loga/expõe `code`, `scope`, tokens ou o `state`. Sempre termina com um
 * redirect para `/app/integracoes` com um indicador genérico de resultado.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const integrationsUrl = (params: Record<string, string>) => {
    const url = new URL("/app/integracoes", getPublicAppUrl());
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url;
  };

  // 1. Usuário negou o consentimento (ou outro erro devolvido pelo Strava).
  const oauthError = searchParams.get("error");
  if (oauthError) {
    const reason = oauthError === "access_denied" ? "access_denied" : "oauth_error";
    return NextResponse.redirect(integrationsUrl({ strava: "error", reason }));
  }

  // 2. Valida o `state` assinado (CSRF + recuperação do userId). Fonte-de-verdade.
  const stateVerification = verifyStravaOAuthState(searchParams.get("state"));
  if (!stateVerification.valid) {
    return NextResponse.redirect(
      integrationsUrl({ strava: "error", reason: "invalid_state" }),
    );
  }

  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      integrationsUrl({ strava: "error", reason: "missing_code" }),
    );
  }

  // 3. Cross-check defensivo: se houver sessão ativa, ela deve bater com o state.
  const session = await auth();
  if (session?.user?.id && session.user.id !== stateVerification.userId) {
    return NextResponse.redirect(
      integrationsUrl({ strava: "error", reason: "user_mismatch" }),
    );
  }

  // 4. Troca o código por token e persiste a conexão (delegado ao módulo).
  try {
    await exchangeStravaCode({
      userId: stateVerification.userId,
      code,
      scope: searchParams.get("scope"),
    });

    // 4b. Backfill inicial (Task 6.4). A troca de token permanece PURA (só
    // token/persistência da conexão); o sync é disparado aqui, após o sucesso.
    //
    // Decisão de arquitetura: fire-and-forget. O backfill pagina a API do
    // Strava e pode levar segundos — aguardá-lo atrasaria o redirect do usuário
    // e o acoplaria a uma dependência de rede externa. Como o upsert é
    // idempotente e a saúde da conexão é atualizada dentro de `syncStravaForUser`,
    // uma falha aqui não corrompe estado nem deve quebrar o fluxo de conexão; o
    // job de sync/o webhook reprocessam depois. Erros são logados (sem segredos)
    // e engolidos para não afetar o redirect.
    void syncStravaForUser(stateVerification.userId, {
      mode: "initial-backfill",
    }).catch((error) => {
      logger.warn("Strava initial backfill after connect failed (non-blocking)", {
        provider: "STRAVA",
        operation: "initial_backfill",
        status: "failed",
        userId: stateVerification.userId,
        errorCode:
          error && typeof error === "object" && "code" in error
            ? String((error as { code: unknown }).code)
            : "UNKNOWN",
      });
    });

    revalidatePath("/app/integracoes");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/atividades");
    revalidatePath("/onboarding");

    return NextResponse.redirect(integrationsUrl({ strava: "connected" }));
  } catch {
    // Módulo já logou o erro com metadados seguros (sem tokens/code).
    return NextResponse.redirect(
      integrationsUrl({ strava: "error", reason: "exchange_failed" }),
    );
  }
}
