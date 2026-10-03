/** SAM-58 — POST /api/workout-catalog/:id/duplicate — { variant?: boolean, title? }: copy or variant; the original never changes. */
import { catalog, catalogResponse, parseJsonBody, type TemplateRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, context: TemplateRouteContext) {
  return catalogResponse(async (actorId) => catalog.duplicate(actorId, (await context.params).templateId, await parseJsonBody(request)), 201);
}
