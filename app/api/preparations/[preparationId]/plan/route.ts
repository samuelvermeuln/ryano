/**
 * SAM-71 — the plan of a preparation (phases, milestones, linked sessions).
 * GET /api/preparations/:id/plan
 */
import { prisma } from "@/server/db";
import { GetPreparationPlan } from "@/modules/school/application/preparation-plan";
import { eventResponse } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getPlan = new GetPreparationPlan(prisma);
type Context = { params: Promise<{ preparationId: string }> };

export function GET(_request: Request, context: Context) {
  return eventResponse(async (actorId) => getPlan.execute(actorId, (await context.params).preparationId));
}