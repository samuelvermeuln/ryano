/** T506 — Detalhe e edição de uma turma. */
import { prisma } from "@/server/db";
import { GetTeamDetail, UpdateTeam } from "@/modules/school/application/list-teams";
import { schoolBody, schoolResponse } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const getDetail = new GetTeamDetail(prisma);
const updateTeam = new UpdateTeam(prisma);

type TeamRouteContext = { params: Promise<{ id: string; teamId: string }> };

export function GET(_request: Request, context: TeamRouteContext) {
  return schoolResponse(async (actorId) => getDetail.execute(actorId, { teamId: (await context.params).teamId }));
}

export function PATCH(request: Request, context: TeamRouteContext) {
  return schoolResponse(async (actorId) => updateTeam.execute(actorId, {
    ...(await schoolBody(request) as Record<string, unknown>),
    teamId: (await context.params).teamId,
  }));
}
