/**
 * DELETE /api/workout-executions/[id]
 * Removes the link between an activity and a workout assignment (UnmatchActivity).
 */
import { executionResponse, unmatchActivity, type ExecutionRouteContext } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function DELETE(_req: Request, { params }: ExecutionRouteContext) {
  return executionResponse(async (actorId) => {
    const { id } = await params;
    return unmatchActivity.execute(actorId, { executionId: id });
  });
}
