/**
 * POST /api/workout-executions/[id]/override
 * Replaces the matched activity with a manually chosen one (OverrideWorkoutMatch).
 * The [id] segment is the workoutAssignmentId.
 */
import { overrideMatch, executionResponse, parseJsonBody, type ExecutionRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: ExecutionRouteContext) {
  return executionResponse(async (actorId) => {
    const { id } = await params;
    const body = await parseJsonBody(request);
    // id here is the workoutAssignmentId (the resource being overridden)
    return overrideMatch.execute(actorId, { ...body as object, workoutAssignmentId: id });
  });
}
