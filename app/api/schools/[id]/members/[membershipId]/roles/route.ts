import { prisma } from "@/server/db";
import { AddRoleToMember, addRoleToMemberSchema } from "@/modules/school/application/add-role-to-member";
import { schoolBody, schoolResponse } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const addRole = new AddRoleToMember(prisma);
type MemberRoleRouteContext = { params: Promise<{ id: string; membershipId: string }> };

export function POST(request: Request, context: MemberRoleRouteContext) {
  return schoolResponse(async (actorId) => {
    const { id, membershipId } = await context.params;
    return addRole.execute(actorId, id, membershipId, addRoleToMemberSchema.parse(await schoolBody(request)));
  }, 201);
}
