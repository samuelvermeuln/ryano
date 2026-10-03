/**
 * SAM-71 — POST /api/preparations/:id/session-links — { assignmentId, phaseId?, milestoneId? }:
 * tags one of the coach's sessions of this athlete with the event (and phase/milestone).
 */
import { prisma } from "@/server/db";
import { LinkSessionToEvent } from "@/modules/school/application/preparation-plan";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const linkSession = new LinkSessionToEvent(prisma);
type Context = { params: Promise<{ preparationId: string }> };

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => linkSession.execute(actorId, (await context.params).preparationId, await parseJsonBody(request)), 201);
}