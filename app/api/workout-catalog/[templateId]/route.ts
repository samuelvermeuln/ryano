/**
 * SAM-58
 * GET /api/workout-catalog/:id?versao=N — the template with one version (current by default) and its versions.
 * PUT /api/workout-catalog/:id — { meta, content, expectedVersion } → a NEW immutable version.
 */
import { catalog, catalogResponse, parseJsonBody, type TemplateRouteContext } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, context: TemplateRouteContext) {
  return catalogResponse(async (actorId) => {
    const version = new URL(request.url).searchParams.get("versao");
    return catalog.get(actorId, (await context.params).templateId, version && /^\d+$/.test(version) ? Number(version) : undefined);
  });
}

export function PUT(request: Request, context: TemplateRouteContext) {
  return catalogResponse(async (actorId) => catalog.saveVersion(actorId, (await context.params).templateId, await parseJsonBody(request)));
}
