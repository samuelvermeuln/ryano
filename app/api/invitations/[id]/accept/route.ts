import { prisma } from "@/server/db";
import { AcceptInvitation } from "@/modules/school/application/accept-invitation";
import { invitationResponse, schoolBody, schoolResponse, type InvitationRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const acceptInvitation = new AcceptInvitation(prisma);

export function POST(request: Request, context: InvitationRouteContext) {
  return invitationResponse(schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    return acceptInvitation.execute(actorId, { token: (await context.params).id });
  }));
}
