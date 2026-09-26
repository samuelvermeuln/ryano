import { prisma } from "@/server/db";
import { GetSchoolMemberDetail } from "@/modules/school/application/get-school-member-detail";
import { RemoveSchoolMember } from "@/modules/school/application/remove-school-member";
import { schoolBody, schoolResponse } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const getMemberDetail = new GetSchoolMemberDetail(prisma);
const removeMember = new RemoveSchoolMember(prisma);
type MemberRouteContext = { params: Promise<{ id: string; membershipId: string }> };

export function GET(_request: Request, context: MemberRouteContext) {
  return schoolResponse(async (actorId) => {
    const { id, membershipId } = await context.params;
    return getMemberDetail.execute(actorId, id, membershipId);
  });
}

export function DELETE(request: Request, context: MemberRouteContext) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    const { id, membershipId } = await context.params;
    return removeMember.execute(actorId, id, membershipId);
  });
}
