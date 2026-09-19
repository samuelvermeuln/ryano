import { parseJsonBody, rescheduleWorkout, workoutResponse } from "../../../workouts/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export function POST(request: Request, context: RouteContext) {
  return workoutResponse(async (actorId) => {
    const { id: assignmentId } = await context.params;
    const body = await parseJsonBody(request);
    return rescheduleWorkout.execute(actorId, Object.assign({}, body, { assignmentId }));
  });
}
