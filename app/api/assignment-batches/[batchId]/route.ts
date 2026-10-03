/** SAM-60 — GET /api/assignment-batches/:id — the batch's result per recipient (author only). */
import { batchResponse, batches, type BatchRouteContext } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, context: BatchRouteContext) {
  return batchResponse(async (actorId) => batches.get(actorId, (await context.params).batchId));
}
