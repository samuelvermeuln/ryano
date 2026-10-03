/**
 * SAM-71 — §22.4: after the event moved, move a block of the linked sessions.
 * POST /api/preparations/:id/move-sessions — { assignmentIds, shiftDays, reason?, preview? }:
 * `preview: true` returns the rows with conflicts; otherwise one new version per session.
 */
import { z } from "zod";
import { prisma } from "@/server/db";
import { MoveSessionBlock } from "@/modules/school/application/preparation-plan";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const move = new MoveSessionBlock(prisma);
type Context = { params: Promise<{ preparationId: string }> };

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => {
    const raw = await parseJsonBody(request);
    const { preview, ...body } = z.object({ preview: z.boolean().optional() }).passthrough().parse(raw);
    const preparationId = (await context.params).preparationId;
    return preview ? move.preview(actorId, preparationId, body) : move.apply(actorId, preparationId, body);
  });
}