import { prisma } from "@/server/db";
import { ResolveInvitationLink } from "@/modules/school/application/resolve-invitation-link";
import { invitationResponse, publicSchoolResponse, type InvitationRouteContext } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const resolveInvitation = new ResolveInvitationLink(prisma);

export function GET(_request: Request, context: InvitationRouteContext) {
  return invitationResponse(publicSchoolResponse(async () =>
    resolveInvitation.execute({ token: (await context.params).id })));
}
