import { prisma } from "@/server/db";
import { BulkAssignCoach, bulkAssignCoachSchema } from "@/modules/school/application/bulk-assign-coach";
import { schoolBody, schoolResponse, type SchoolRouteContext } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bulkAssignCoach = new BulkAssignCoach(prisma);

export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    const input = bulkAssignCoachSchema.parse(await schoolBody(request));
    return bulkAssignCoach.execute(actorId, (await context.params).id, input);
  }, 201);
}
