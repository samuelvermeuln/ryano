/**
 * SAM-75 — POST /api/activities/:id/segments — { startOffsetSeconds, endOffsetSeconds, kind?, label?, workoutAssignmentId? }:
 * the athlete or the coach selects a trecho of the file (never overlapping another), optionally for a prescription.
 */
import { prisma } from "@/server/db";
import { SelectActivitySegment } from "@/modules/shared/activities/application/multisport";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const select = new SelectActivitySegment(prisma);
type Context = { params: Promise<{ id: string }> };

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => select.execute(actorId, (await context.params).id, await parseJsonBody(request)), 201);
}