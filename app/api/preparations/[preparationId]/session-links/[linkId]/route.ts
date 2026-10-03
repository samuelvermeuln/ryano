/**
 * SAM-71 — DELETE /api/preparations/:id/session-links/:linkId — untags the session (the session itself stays).
 */
import { prisma } from "@/server/db";
import { UnlinkSessionFromEvent } from "@/modules/school/application/preparation-plan";
import { eventResponse } from "../../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unlinkSession = new UnlinkSessionFromEvent(prisma);
type Context = { params: Promise<{ preparationId: string; linkId: string }> };

export function DELETE(_request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    const { preparationId, linkId } = await context.params;
    await unlinkSession.execute(actorId, preparationId, linkId);
    return { ok: true };
  });
}