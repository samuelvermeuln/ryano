/**
 * SAM-78 — POST /api/workout-catalog/proposals/:id — { decision: APPROVE | REJECT, reviewNote? }:
 * OWNER/ADMIN or a REVIEWER publishes a copy (author kept) or rejects with the note.
 */
import { prisma } from "@/server/db";
import { ReviewTemplateProposal } from "@/modules/school/application/workout-catalog-collaboration";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const review = new ReviewTemplateProposal(prisma);
type Context = { params: Promise<{ proposalId: string }> };

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => review.execute(actorId, (await context.params).proposalId, await parseJsonBody(request)));
}