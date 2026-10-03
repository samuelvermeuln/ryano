/**
 * SAM-54
 * GET  /api/preparations/:id — the follow-up (404 for anyone without an active link, AC21).
 * POST /api/preparations/:id — { action: assume | assign | pause | resume | close, expectedVersion, … }.
 */
import { prisma } from "@/server/db";
import { ChangeEventPreparation, GetEventPreparation } from "@/modules/school/application/event-preparations";
import { eventResponse, parseJsonBody } from "../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getPreparation = new GetEventPreparation(prisma);
const changePreparation = new ChangeEventPreparation(prisma);

type Context = { params: Promise<{ preparationId: string }> };

export function GET(_request: Request, context: Context) {
  return eventResponse(async (actorId) => getPreparation.execute(actorId, (await context.params).preparationId));
}

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => changePreparation.execute(actorId, (await context.params).preparationId, await parseJsonBody(request)));
}
