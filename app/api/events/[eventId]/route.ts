/** SAM-51 — PATCH /api/events/:eventId — edit an event (revision + conflict on stale version). */
import { eventResponse, parseJsonBody, updateSportEvent } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ eventId: string }> };

export function PATCH(request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    const { eventId } = await context.params;
    return updateSportEvent.execute(actorId, eventId, await parseJsonBody(request));
  });
}
