/**
 * SAM-75 — POST /api/bricks — { assignmentIds }: the coach chains sessions as a brick, in scheduled order.
 */
import { prisma } from "@/server/db";
import { LinkBrick } from "@/modules/shared/activities/application/multisport";
import { eventResponse, parseJsonBody } from "../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const link = new LinkBrick(prisma);

export function POST(request: Request) {
  return eventResponse(async (actorId) => link.execute(actorId, await parseJsonBody(request)), 201);
}