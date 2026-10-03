/**
 * SAM-55
 * GET  /api/follow-ups/:id — open the task (NEW → SEEN; never resolves it).
 * POST /api/follow-ups/:id — { action: see | start | resolve | reschedule | cancel, expectedVersion, … }.
 */
import { prisma } from "@/server/db";
import { ChangeFollowUpTask, GetFollowUpTask } from "@/modules/school/application/follow-up-tasks";
import { eventResponse, parseJsonBody } from "../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getTask = new GetFollowUpTask(prisma);
const changeTask = new ChangeFollowUpTask(prisma);

type Context = { params: Promise<{ taskId: string }> };

export function GET(_request: Request, context: Context) {
  return eventResponse(async (actorId) => getTask.execute(actorId, (await context.params).taskId));
}

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => changeTask.execute(actorId, (await context.params).taskId, await parseJsonBody(request)));
}
