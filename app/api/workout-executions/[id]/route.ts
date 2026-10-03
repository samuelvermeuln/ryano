/**
 * DELETE /api/workout-executions/[id]
 * Undoes the link between an activity and a workout assignment (UnmatchActivity).
 * SAM-62 — nothing is deleted; an optional JSON body `{ reason }` is recorded.
 */
import { executionResponse, parseJsonBody, unmatchActivity, type ExecutionRouteContext } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function DELETE(request: Request, { params }: ExecutionRouteContext) {
  return executionResponse(async (actorId) => {
    const { id } = await params;
    const body = (await parseJsonBody(request)) as { reason?: unknown };
    return unmatchActivity.execute(actorId, { executionId: id, ...(typeof body.reason === "string" ? { reason: body.reason } : {}) });
  });
}
