import { prisma } from "@/server/db";
import { ApproveCoachSchoolMembership } from "@/modules/school/application/approve-coach-school-membership";
import { schoolBody, schoolResponse } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const operation = new ApproveCoachSchoolMembership(prisma);
type MembershipRouteContext = { params: Promise<{ id: string; membershipId: string }> };

export function POST(request: Request, context: MembershipRouteContext) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    const { id, membershipId } = await context.params;
    return operation.execute(actorId, id, membershipId);
  });
}
