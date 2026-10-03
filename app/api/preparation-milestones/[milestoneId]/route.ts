/**
 * SAM-71 — POST /api/preparation-milestones/:id —
 * { status } (planned / in progress / in review / cancelled), or
 * { decision, observation, isVisible? } — achieved / partially / not achieved, the coach's review (§8.3).
 */
import { z } from "zod";
import { prisma } from "@/server/db";
import { DecideMilestone, SetMilestoneStatus } from "@/modules/school/application/preparation-plan";
import { eventResponse, parseJsonBody } from "../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const setStatus = new SetMilestoneStatus(prisma);
const decide = new DecideMilestone(prisma);
type Context = { params: Promise<{ milestoneId: string }> };

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    const raw = await parseJsonBody(request);
    const milestoneId = (await context.params).milestoneId;
    const { status, ...decision } = z.object({ status: z.string().optional() }).passthrough().parse(raw);
    if (status) {
      await setStatus.execute(actorId, milestoneId, status);
    } else {
      await decide.execute(actorId, milestoneId, decision);
    }
    return { ok: true };
  });
}