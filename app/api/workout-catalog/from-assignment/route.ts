/** SAM-58 — POST /api/workout-catalog/from-assignment — { assignmentId, title? }: save an individual adaptation as a template, without the athlete's personal values. */
import { catalog, catalogResponse, parseJsonBody } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return catalogResponse(async (actorId) => catalog.saveAdaptationAsTemplate(actorId, await parseJsonBody(request)), 201);
}
