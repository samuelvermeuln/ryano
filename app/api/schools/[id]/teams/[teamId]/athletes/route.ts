/** T507 — Vínculo de atletas com a turma. */
import { z } from "zod";
import { prisma } from "@/server/db";
import { AddAthleteToTeam, RemoveAthleteFromTeam } from "@/modules/school/application/manage-team";
import { schoolBody, schoolResponse } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const addAthlete = new AddAthleteToTeam(prisma);
const removeAthlete = new RemoveAthleteFromTeam(prisma);

type TeamRouteContext = { params: Promise<{ id: string; teamId: string }> };
const athleteIdSchema = z.strictObject({ athleteId: z.string().min(1).max(256) });

export function POST(request: Request, context: TeamRouteContext) {
  return schoolResponse(async (actorId) => addAthlete.execute(actorId, {
    teamId: (await context.params).teamId,
    ...athleteIdSchema.parse(await schoolBody(request)),
  }), 201);
}

export function DELETE(request: Request, context: TeamRouteContext) {
  return schoolResponse(async (actorId) => removeAthlete.execute(actorId, {
    teamId: (await context.params).teamId,
    // O atleta vai na query string porque DELETE com corpo não é tratado de
    // forma consistente por proxies e clientes.
    ...athleteIdSchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
  }));
}
