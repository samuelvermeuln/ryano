/** SAM-60 — POST /api/assignment-batches/:id/retry — "Repetir falhas": only FAILED recipients run again. */
import { batchResponse, batches, type BatchRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function POST(_request: Request, context: BatchRouteContext) {
  return batchResponse(async (actorId) => batches.retryFailed(actorId, (await context.params).batchId));
}
