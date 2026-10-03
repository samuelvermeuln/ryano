/** SAM-68 — POST /api/schools/[id]/collaborators — a collaborator coach (optionally by discipline) joins an athlete's team. */
import { prisma } from "@/server/db";
import { AddCollaboratorCoach } from "@/modules/school/application/school-follow-up";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addCollaborator = new AddCollaboratorCoach(prisma);

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return eventResponse(async (actorId) => addCollaborator.execute(actorId, (await params).id, await parseJsonBody(request)), 201);
}