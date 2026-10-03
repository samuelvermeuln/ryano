/** SAM-54 — GET /api/preparations — follow-ups the coach is responsible for + the unassigned queue of schools the actor manages. */
import { prisma } from "@/server/db";
import { ListCoachPreparations } from "@/modules/school/application/event-preparations";
import { eventResponse } from "../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listPreparations = new ListCoachPreparations(prisma);

export function GET() {
  return eventResponse(async (actorId) => listPreparations.execute(actorId));
}
