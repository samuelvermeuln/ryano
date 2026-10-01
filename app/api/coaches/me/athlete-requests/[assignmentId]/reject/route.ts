import { prisma } from "@/server/db";
import { DecideCoachAssignmentRequest } from "@/modules/school/application/decide-coach-assignment-request";
import { schoolBody, schoolResponse } from "@/app/api/schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const decide = new DecideCoachAssignmentRequest(prisma);

type Context = { params: Promise<{ assignmentId: string }> };

/** SAM-26 — the session coach declines an athlete's request addressed to them. */
export function POST(request: Request, context: Context) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    return decide.execute(actorId, (await context.params).assignmentId, "reject");
  });
}
