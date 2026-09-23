/** T507 — Vínculo de professores com a turma. */
import { z } from "zod";
import { prisma } from "@/server/db";
import { AddCoachToTeam, RemoveCoachFromTeam } from "@/modules/school/application/manage-team";
import { schoolBody, schoolResponse } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const addCoach = new AddCoachToTeam(prisma);
const removeCoach = new RemoveCoachFromTeam(prisma);

type TeamRouteContext = { params: Promise<{ id: string; teamId: string }> };
const coachIdSchema = z.strictObject({ coachId: z.string().min(1).max(256) });

export function POST(request: Request, context: TeamRouteContext) {
  return schoolResponse(async (actorId) => addCoach.execute(actorId, {
    teamId: (await context.params).teamId,
    ...coachIdSchema.parse(await schoolBody(request)),
  }), 201);
}

export function DELETE(request: Request, context: TeamRouteContext) {
  return schoolResponse(async (actorId) => removeCoach.execute(actorId, {
    teamId: (await context.params).teamId,
    ...coachIdSchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
  }));
}
