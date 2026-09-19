import { prisma } from "@/server/db";
import { SchoolError } from "@/modules/school/domain/errors";
import { WorkoutTemplateRepository } from "@/modules/school/infrastructure/workout-template-repository";
import { templateBody, templateResponse, updateTemplate, type WorkoutTemplateRouteContext } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repo = new WorkoutTemplateRepository(prisma);

export function GET(_request: Request, context: WorkoutTemplateRouteContext) {
  return templateResponse(async () => {
    const { id } = await context.params;
    const template = await repo.findById(id);
    if (!template) throw new SchoolError("WORKOUT_TEMPLATE_NOT_FOUND", "Template não encontrado.", 404);
    return template;
  });
}

export function PATCH(request: Request, context: WorkoutTemplateRouteContext) {
  return templateResponse(async (actorId) => {
    const { id } = await context.params;
    return updateTemplate.execute(actorId, Object.assign({}, await templateBody(request), { templateId: id }));
  });
}
