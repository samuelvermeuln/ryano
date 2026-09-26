import { prisma } from "@/server/db";
import { SetCoachSuspension } from "@/modules/school/application/set-coach-suspension";
import { schoolBody, schoolResponse } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const suspension = new SetCoachSuspension(prisma);
type MembershipRouteContext = { params: Promise<{ id: string; membershipId: string }> };

/**
 * Separate from DELETE on the parent route: that one removes the coach from the
 * school and ends every athlete assignment, while this only pauses the link.
 */
export function PATCH(request: Request, context: MembershipRouteContext) {
  return schoolResponse(async (actorId) => {
    const body = await schoolBody(request);
    const { id, membershipId } = await context.params;
    return suspension.execute(actorId, id, membershipId, body);
  });
}
