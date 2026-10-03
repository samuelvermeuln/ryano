/**
 * SAM-71 — POST /api/preparations/:id/milestones — { milestoneId?, milestone }.
 */
import { z } from "zod";
import { prisma } from "@/server/db";
import { SaveMilestone } from "@/modules/school/application/preparation-plan";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveMilestone = new SaveMilestone(prisma);
type Context = { params: Promise<{ preparationId: string }> };
const bodySchema = z.object({ milestoneId: z.string().min(1).max(256).nullish(), milestone: z.unknown() });

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    const body = bodySchema.parse(await parseJsonBody(request));
    return saveMilestone.execute(actorId, (await context.params).preparationId, body.milestone, body.milestoneId);
  }, 201);
}