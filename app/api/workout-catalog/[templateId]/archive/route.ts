/** SAM-58 — POST /api/workout-catalog/:id/archive — hidden from new uses, kept in history. */
import { catalog, catalogResponse, type TemplateRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(_request: Request, context: TemplateRouteContext) {
  return catalogResponse(async (actorId) => catalog.archive(actorId, (await context.params).templateId));
}
