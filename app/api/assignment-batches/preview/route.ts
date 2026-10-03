/** SAM-60 — POST /api/assignment-batches/preview — one row per athlete (resolved targets, blocked reason, conflicts); writes nothing. */
import { batchResponse, batches, parseJsonBody } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return batchResponse(async (actorId) => batches.preview(actorId, await parseJsonBody(request)));
}
