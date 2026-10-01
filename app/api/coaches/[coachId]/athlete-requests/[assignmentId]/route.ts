import { prisma } from "@/server/db";
import { CancelCoachAssignmentRequest } from "@/modules/school/application/cancel-coach-assignment-request";
import { schoolResponse } from "@/app/api/schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cancelRequest = new CancelCoachAssignmentRequest(prisma);

type Context = { params: Promise<{ coachId: string; assignmentId: string }> };

/** SAM-25 — the athlete withdraws a request the coach has not answered yet. */
export function DELETE(_request: Request, context: Context) {
  return schoolResponse(async (actorId) => {
    const { coachId, assignmentId } = await context.params;
    return cancelRequest.execute(actorId, coachId, assignmentId);
  });
}
