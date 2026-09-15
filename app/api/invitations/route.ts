import { prisma } from "@/server/db";
import { CreateInvitationLink } from "@/modules/school/application/create-invitation-link";
import { invitationResponse, schoolBody, schoolResponse } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const createInvitation = new CreateInvitationLink(prisma);

export function POST(request: Request) {
  return invitationResponse(schoolResponse(async (actorId) =>
    createInvitation.execute(actorId, await schoolBody(request)), 201));
}
