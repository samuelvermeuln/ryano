/** SAM-53 — PATCH /api/goals/:goalId — change a goal (revision with before/after; conflict on stale version). */
import { prisma } from "@/server/db";
import { UpdateAthleteGoal } from "@/modules/school/application/athlete-goals";
import { eventResponse, parseJsonBody } from "../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateGoal = new UpdateAthleteGoal(prisma);

type Context = { params: Promise<{ goalId: string }> };

export function PATCH(request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    const { goalId } = await context.params;
    return updateGoal.execute(actorId, goalId, await parseJsonBody(request));
  });
}
