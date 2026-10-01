import { prisma } from "@/server/db";
import { RequestWorkoutChangeAsAthlete } from "@/modules/school/application/request-workout-change-as-athlete";
import { parseJsonBody, workoutResponse } from "../../../workouts/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const request = new RequestWorkoutChangeAsAthlete(prisma);

/** SAM-27 — the athlete asks the responsible coach to change this prescription. Body: `{ reason }`. */
export function POST(httpRequest: Request, context: RouteContext) {
  return workoutResponse(async (actorId) => request.execute(actorId, (await context.params).id, await parseJsonBody(httpRequest)), 201);
}
