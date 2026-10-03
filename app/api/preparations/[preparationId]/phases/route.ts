/**
 * SAM-71 — POST /api/preparations/:id/phases — { phaseId?, expectedVersion?, reason?, phase }.
 * Creating needs no reason; changing an existing phase does (new version, author and reason kept).
 */
import { prisma } from "@/server/db";
import { SavePreparationPhase } from "@/modules/school/application/preparation-plan";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const savePhase = new SavePreparationPhase(prisma);
type Context = { params: Promise<{ preparationId: string }> };

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => savePhase.execute(actorId, (await context.params).preparationId, await parseJsonBody(request)), 201);
}