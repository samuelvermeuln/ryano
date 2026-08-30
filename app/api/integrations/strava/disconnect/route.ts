import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { auth } from "@/server/auth";
import { revokeStravaConnection } from "@/modules/strava";

/**
 * Desconexão do Strava (adapter fino — Task 5.5, Req 10.6, 13.7).
 *
 * `DELETE` (mesmo estilo do disconnect do Garmin em
 * `app/api/integrations/garmin/route.ts`): exige sessão e delega a revogação +
 * limpeza ao módulo, que já escopa tudo por `userId`/conexão STRAVA — sem afetar
 * outros providers (Req 10.6). A rota não contém lógica de negócio.
 */
export async function DELETE() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await revokeStravaConnection({ userId: session.user.id });

  revalidatePath("/app/integracoes");
  revalidatePath("/app/dashboard");
  revalidatePath("/onboarding");

  return NextResponse.json({ ok: true, status: "disconnected" });
}
