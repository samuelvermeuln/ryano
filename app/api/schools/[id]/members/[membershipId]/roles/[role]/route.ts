import { prisma } from "@/server/db";
import { RemoveRoleFromMember, removeRoleFromMemberSchema } from "@/modules/school/application/remove-role-from-member";
import { schoolBody, schoolResponse } from "../../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const removeRole = new RemoveRoleFromMember(prisma);
type MemberRoleRouteContext = { params: Promise<{ id: string; membershipId: string; role: string }> };

export function DELETE(request: Request, context: MemberRoleRouteContext) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    const { id, membershipId, role } = await context.params;
    return removeRole.execute(actorId, id, membershipId, removeRoleFromMemberSchema.parse({ role }));
  });
}
