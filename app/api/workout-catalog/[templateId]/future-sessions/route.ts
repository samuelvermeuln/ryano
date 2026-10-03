/**
 * SAM-60
 * GET  /api/workout-catalog/:id/future-sessions — this coach's future sessions made from an older version.
 * POST /api/workout-catalog/:id/future-sessions — { assignmentIds, reason? }: revise the chosen ones to the current version.
 */
import { prisma } from "@/server/db";
import { UpdateFutureSessionsFromTemplate } from "@/modules/school/application/assignment-batches";
import { catalogResponse, parseJsonBody, type TemplateRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updater = new UpdateFutureSessionsFromTemplate(prisma);

export function GET(_request: Request, context: TemplateRouteContext) {
  return catalogResponse(async (actorId) => updater.listOutdated(actorId, (await context.params).templateId));
}

export function POST(request: Request, context: TemplateRouteContext) {
  return catalogResponse(async (actorId) => updater.apply(actorId, (await context.params).templateId, await parseJsonBody(request)));
}
