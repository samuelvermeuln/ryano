import { prisma } from "@/server/db";
import { RemoveSchoolMember } from "@/modules/school/application/remove-school-member";
import { schoolBody, schoolResponse } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const removeMember = new RemoveSchoolMember(prisma);
type MemberRouteContext = { params: Promise<{ id: string; membershipId: string }> };

export function DELETE(request: Request, context: MemberRouteContext) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    const { id, membershipId } = await context.params;
    return removeMember.execute(actorId, id, membershipId);
  });
}
