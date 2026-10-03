/** SAM-60 — POST /api/assignment-batches/:id/undo — cancels the batch's future, not executed sessions only. */
import { batchResponse, batches, type BatchRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(_request: Request, context: BatchRouteContext) {
  return batchResponse(async (actorId) => batches.undoFuture(actorId, (await context.params).batchId));
}
