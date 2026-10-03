/**
 * SAM-58
 * GET  /api/workout-catalog?q=&sportType=&environment=&level=&phase=&folder=&tag=&author=me|school&favorites=1&archived=1&maxDurationMin=&maxDistanceM=
 * POST /api/workout-catalog — { scope: { kind: "coach" } | { kind: "school", schoolId }, meta, content }
 */
import { catalog, catalogResponse, parseJsonBody } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return catalogResponse(async (actorId) => {
    const params = Object.fromEntries([...new URL(request.url).searchParams.entries()].filter(([, value]) => value !== ""));
    return catalog.list(actorId, params);
  });
}

export function POST(request: Request) {
  return catalogResponse(async (actorId) => catalog.create(actorId, await parseJsonBody(request)), 201);
}
