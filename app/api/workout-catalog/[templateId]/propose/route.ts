/**
 * SAM-78 — POST /api/workout-catalog/:templateId/propose — { schoolId, note?, usageRights? }:
 * the author offers a personal template to a school; publishing is the reviewer's decision.
 */
import { prisma } from "@/server/db";
import { ProposeTemplate } from "@/modules/school/application/workout-catalog-collaboration";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const propose = new ProposeTemplate(prisma);
type Context = { params: Promise<{ templateId: string }> };

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    const body = (await parseJsonBody(request)) as Record<string, unknown>;
    return propose.execute(actorId, { ...body, templateId: (await context.params).templateId });
  }, 201);
}