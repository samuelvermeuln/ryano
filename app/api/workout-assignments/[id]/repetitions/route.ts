/**
 * SAM-72 — POST /api/workout-assignments/:id/repetitions — { blockIndex, count }:
 * the athlete or the coach confirms the repetitions done in a block (§17.4).
 */
import { prisma } from "@/server/db";
import { ConfirmRepetitions } from "@/modules/school/application/block-comparison";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirm = new ConfirmRepetitions(prisma);
type Context = { params: Promise<{ id: string }> };

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => confirm.execute(actorId, (await context.params).id, await parseJsonBody(request)));
}