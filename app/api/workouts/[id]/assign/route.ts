import { parseJsonBody, assignWorkout, workoutResponse } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export function POST(request: Request, context: RouteContext) {
  return workoutResponse(async (actorId) => {
    const { id: workoutId } = await context.params;
    const body = await parseJsonBody(request);
    return assignWorkout.execute(actorId, Object.assign({}, body, { workoutId }));
  }, 201);
}
