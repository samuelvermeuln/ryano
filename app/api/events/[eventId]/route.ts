/**
 * SAM-51/52
 * GET   /api/events/:eventId — event, options and modality rows (conditions with provenance, segments).
 * PATCH /api/events/:eventId — edit an event (revision + conflict on stale version).
 */
import { eventResponse, getSportEvent, parseJsonBody, updateSportEvent } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ eventId: string }> };

export function GET(_request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    const { eventId } = await context.params;
    return getSportEvent.execute(actorId, eventId);
  });
}

export function PATCH(request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    const { eventId } = await context.params;
    return updateSportEvent.execute(actorId, eventId, await parseJsonBody(request));
  });
}
