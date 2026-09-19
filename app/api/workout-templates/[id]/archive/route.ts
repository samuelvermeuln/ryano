import { archiveTemplate, templateResponse, type WorkoutTemplateRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(_request: Request, context: WorkoutTemplateRouteContext) {
  return templateResponse(async (actorId) => {
    const { id } = await context.params;
    return archiveTemplate.execute(actorId, { templateId: id });
  });
}
