import { prisma } from "@/server/db";
import { DecideWorkoutChange, decideWorkoutChangeSchema } from "@/modules/school/application/decide-workout-change";
import { schoolBody, schoolResponse } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const decideChange = new DecideWorkoutChange(prisma);
type ChangeRequestRouteContext = { params: Promise<{ id: string; requestId: string }> };

export function PATCH(request: Request, context: ChangeRequestRouteContext) {
  return schoolResponse(async (actorId) => {
    const input = decideWorkoutChangeSchema.parse(await schoolBody(request));
    const { id, requestId } = await context.params;
    return decideChange.execute(actorId, id, requestId, input);
  });
}
