/** SAM-60 — POST /api/assignment-batches — publish a batch (idempotent by `idempotencyKey`); returns the result per recipient. */
import { batchResponse, batches, parseJsonBody } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One transaction per recipient against a remote database: give the batch room.
export const maxDuration = 300;

export function POST(request: Request) {
  return batchResponse(async (actorId) => batches.publish(actorId, await parseJsonBody(request)), 201);
}
