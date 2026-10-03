/** SAM-51 — GET /api/events/search?q=&athleteId= — events the actor may pick. */
import { eventResponse, searchEvents } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return eventResponse(async (actorId) => {
    const params = new URL(request.url).searchParams;
    return searchEvents.execute(actorId, {
      q: params.get("q") ?? "",
      ...(params.get("athleteId") ? { athleteId: params.get("athleteId") } : {}),
    });
  });
}
