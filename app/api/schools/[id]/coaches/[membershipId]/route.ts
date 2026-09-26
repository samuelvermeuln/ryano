import { prisma } from "@/server/db";
import { GetCoachDetail } from "@/modules/school/application/get-coach-detail";
import { RemoveCoachFromSchool } from "@/modules/school/application/remove-coach-from-school";
import { schoolBody, schoolResponse } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const getCoachDetail = new GetCoachDetail(prisma);
const operation = new RemoveCoachFromSchool(prisma);
type MembershipRouteContext = { params: Promise<{ id: string; membershipId: string }> };

export function GET(_request: Request, context: MembershipRouteContext) {
  return schoolResponse(async (actorId) => {
    const { id, membershipId } = await context.params;
    return getCoachDetail.execute(actorId, id, membershipId);
  });
}

export function DELETE(request: Request, context: MembershipRouteContext) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    const { id, membershipId } = await context.params;
    return operation.execute(actorId, id, membershipId);
  });
}
