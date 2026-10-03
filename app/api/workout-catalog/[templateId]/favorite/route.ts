/** SAM-58 — PUT/DELETE /api/workout-catalog/:id/favorite — the coach's favourites. */
import { catalog, catalogResponse, type TemplateRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PUT(_request: Request, context: TemplateRouteContext) {
  return catalogResponse(async (actorId) => catalog.setFavorite(actorId, (await context.params).templateId, true));
}

export function DELETE(_request: Request, context: TemplateRouteContext) {
  return catalogResponse(async (actorId) => catalog.setFavorite(actorId, (await context.params).templateId, false));
}
