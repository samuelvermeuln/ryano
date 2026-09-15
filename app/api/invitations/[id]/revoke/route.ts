import { prisma } from "@/server/db";
import { RevokeInvitation } from "@/modules/school/application/revoke-invitation";
import { invitationResponse, schoolBody, schoolResponse, type InvitationRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const revokeInvitation = new RevokeInvitation(prisma);

export function POST(request: Request, context: InvitationRouteContext) {
  return invitationResponse(schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    return revokeInvitation.execute(actorId, { invitationId: (await context.params).id });
  }));
}
