import { prisma } from "@/server/db";
import { RemoveAthleteFromSchool } from "@/modules/school/application/remove-athlete-from-school";
import { schoolBody, schoolResponse } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const operation = new RemoveAthleteFromSchool(prisma);
type MembershipRouteContext = { params: Promise<{ id: string; membershipId: string }> };

export function DELETE(request: Request, context: MembershipRouteContext) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    const { id, membershipId } = await context.params;
    return operation.execute(actorId, id, membershipId);
  });
}
