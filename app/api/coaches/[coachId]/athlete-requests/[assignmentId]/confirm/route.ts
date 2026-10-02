import { prisma } from "@/server/db";
import { ConfirmTransferToIndependent } from "@/modules/school/application/confirm-transfer-to-independent";
import { schoolResponse } from "@/app/api/schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const confirmTransfer = new ConfirmTransferToIndependent(prisma);

type Context = { params: Promise<{ coachId: string; assignmentId: string }> };

/**
 * SAM-30 — the athlete confirms the coach's proposal to continue independently
 * (the PENDING row with `reason = moved_from_school`). Declining is the
 * sibling `DELETE` (the existing cancel route).
 */
export function POST(_request: Request, context: Context) {
  return schoolResponse(async (actorId) => {
    const { coachId, assignmentId } = await context.params;
    return confirmTransfer.execute(actorId, coachId, assignmentId);
  });
}
