/** SAM-51 — PATCH /api/events/participations/:id — change a participation (revision + conflict on stale version). */
import { eventResponse, parseJsonBody, updateParticipation } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ participationId: string }> };

export function PATCH(request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    const { participationId } = await context.params;
    return updateParticipation.execute(actorId, participationId, await parseJsonBody(request));
  });
}
