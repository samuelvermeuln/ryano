/**
 * SAM-51
 * GET  /api/events?athleteId=… — participations of an athlete (default: me).
 * POST /api/events            — register a participation (existing or new event).
 */
import { createParticipation, eventResponse, listParticipations, parseJsonBody } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return eventResponse(async (actorId) => {
    const athleteId = new URL(request.url).searchParams.get("athleteId") ?? actorId;
    return listParticipations.execute(actorId, athleteId);
  });
}

export function POST(request: Request) {
  return eventResponse(async (actorId) => createParticipation.execute(actorId, await parseJsonBody(request)), 201);
}
