/** SAM-55 — GET /api/follow-ups?status=open|all|RESOLVED|CANCELLED&days=N — tasks of the actor and of the school queues they manage. */
import { prisma } from "@/server/db";
import { ListFollowUpTasks } from "@/modules/school/application/follow-up-tasks";
import { eventResponse } from "../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listTasks = new ListFollowUpTasks(prisma);

export function GET(request: Request) {
  return eventResponse(async (actorId) => {
    const params = new URL(request.url).searchParams;
    return listTasks.execute(actorId, {
      ...(params.get("status") ? { status: params.get("status") } : {}),
      ...(params.get("days") ? { days: params.get("days") } : {}),
    });
  });
}
