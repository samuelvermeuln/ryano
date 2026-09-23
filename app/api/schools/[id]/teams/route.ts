/** T505 — Coleção de turmas da escola. */
import { prisma } from "@/server/db";
import { CreateTeam } from "@/modules/school/application/manage-team";
import { ListTeams } from "@/modules/school/application/list-teams";
import { schoolBody, schoolResponse, type SchoolRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const listTeams = new ListTeams(prisma);
const createTeam = new CreateTeam(prisma);

export function GET(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => listTeams.execute(actorId, {
    schoolId: (await context.params).id,
    ...Object.fromEntries(new URL(request.url).searchParams),
  }));
}

export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => createTeam.execute(actorId, {
    ...(await schoolBody(request) as Record<string, unknown>),
    // O schoolId vem da rota, nunca do corpo: aceitá-lo do corpo permitiria
    // criar turma em outra escola passando pela autorização desta.
    schoolId: (await context.params).id,
  }), 201);
}
