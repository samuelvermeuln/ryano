/** T506 — Arquivamento de turma (soft-delete; nada é removido). */
import { prisma } from "@/server/db";
import { ArchiveTeam } from "@/modules/school/application/manage-team";
import { schoolBody, schoolResponse } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const archiveTeam = new ArchiveTeam(prisma);

type TeamRouteContext = { params: Promise<{ id: string; teamId: string }> };

export function POST(request: Request, context: TeamRouteContext) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    return archiveTeam.execute(actorId, { teamId: (await context.params).teamId });
  });
}
