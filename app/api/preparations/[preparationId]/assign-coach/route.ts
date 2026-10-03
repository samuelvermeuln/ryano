/** SAM-68 — POST /api/preparations/[preparationId]/assign-coach — the school's coordination assigns a coach (creating the link when needed). */
import { prisma } from "@/server/db";
import { AssignPreparationCoach } from "@/modules/school/application/school-follow-up";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assign = new AssignPreparationCoach(prisma);

export function POST(request: Request, { params }: { params: Promise<{ preparationId: string }> }) {
  return eventResponse(async (actorId) => assign.execute(actorId, (await params).preparationId, await parseJsonBody(request)));
}