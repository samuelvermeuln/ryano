/**
 * POST /api/workout-executions/[id]/confirm
 * Confirms an AUTO_MATCHED execution → CONFIRMED (ConfirmWorkoutMatch).
 */
import { confirmMatch, executionResponse, type ExecutionRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(_req: Request, { params }: ExecutionRouteContext) {
  return executionResponse(async (actorId) => {
    const { id } = await params;
    return confirmMatch.execute(actorId, { executionId: id });
  });
}
