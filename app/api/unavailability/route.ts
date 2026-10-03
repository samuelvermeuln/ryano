/**
 * SAM-57
 * GET  /api/unavailability?from=YYYY-MM-DD&to=YYYY-MM-DD&athleteId=… — periods in range (default: me).
 * POST /api/unavailability — the athlete records a period { startLocalDate, endLocalDate, reason }.
 */
import { prisma } from "@/server/db";
import { AthleteUnavailabilityService } from "@/modules/school/application/athlete-unavailability";
import { eventResponse, parseJsonBody } from "../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const service = new AthleteUnavailabilityService(prisma);

export function GET(request: Request) {
  return eventResponse(async (actorId) => {
    const params = new URL(request.url).searchParams;
    return service.list(actorId, params.get("athleteId") ?? actorId, { from: params.get("from") ?? "0000-01-01", to: params.get("to") ?? "9999-12-31" });
  });
}

export function POST(request: Request) {
  return eventResponse(async (actorId) => service.create(actorId, await parseJsonBody(request)), 201);
}
