import { redirect } from "next/navigation";

import { requireOnboardedSession } from "@/server/auth-guards";
import { resolveUserLandingRoute } from "@/server/user-context";

/** SAM-14 — `/app` leva à landing do contexto ativo, não ao dashboard do atleta por padrão. */
export default async function AppIndexPage() {
  const session = await requireOnboardedSession();
  redirect(await resolveUserLandingRoute(session.user.id));
}
