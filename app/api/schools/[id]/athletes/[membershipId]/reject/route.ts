import { prisma } from "@/server/db";
import { RejectAthleteMembership } from "@/modules/school/application/reject-athlete-membership";
import { schoolBody, schoolResponse } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const operation = new RejectAthleteMembership(prisma);
type MembershipRouteContext = { params: Promise<{ id: string; membershipId: string }> };

export function POST(request: Request, context: MembershipRouteContext) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    const { id, membershipId } = await context.params;
    return operation.execute(actorId, id, membershipId);
  });
}
