import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { auth } from "@/server/auth";
import { assertRateLimit, isRateLimitError } from "@/server/rate-limit";
import { syncStravaForUser } from "@/modules/strava";

/**
 * Sincronização manual do Strava (adapter fino — mesmo estilo de
 * `app/api/integrations/garmin/sync/route.ts`).
 *
 * `POST` exige sessão, aplica o rate limit da aplicação e delega ao módulo.
 * O modo é `auto`: backfill se a conexão nunca concluiu um sync, incremental
 * caso contrário — a decisão vive em `syncStravaForUser`, não aqui.
 *
 * Respostas estáveis:
 * - 200 `{ ok: true, status: "synced" | "rate-limited", ... }`
 * - 401 `{ error: "UNAUTHORIZED" }`
 * - 404 `{ error: "STRAVA_NOT_CONNECTED" }`
 * - 429 `{ error: "RATE_LIMIT_EXCEEDED" }` (rate limit da aplicação)
 * - 502 `{ error: <errorCode>, status: "failed", ... }`
 */
export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    await assertRateLimit(`api-strava-sync:${session.user.id}`, 10, 1000 * 60 * 10);
  } catch (error) {
    if (isRateLimitError(error)) {
      return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429 });
    }
    throw error;
  }

  const result = await syncStravaForUser(session.user.id);

  if (result.status === "no-connection") {
    return NextResponse.json({ error: "STRAVA_NOT_CONNECTED" }, { status: 404 });
  }

  // Mesmo um sync parcial (rate limit / falha no meio) pode ter persistido
  // atividades; as telas que as exibem precisam ser revalidadas.
  revalidatePath("/app/integracoes");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/atividades");
  revalidatePath("/onboarding");

  if (result.status === "failed") {
    return NextResponse.json(
      { error: result.errorCode ?? "STRAVA_SYNC_FAILED", ...result },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
