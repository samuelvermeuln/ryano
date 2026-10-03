/** SAM-64 — POST /api/coach-reviews — the coach reviews a session or a preparation (creates or edits, keeping revisions). */
import { prisma } from "@/server/db";
import { SaveCoachReview } from "@/modules/school/application/coach-reviews";
import { eventResponse, parseJsonBody } from "../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveReview = new SaveCoachReview(prisma);

export function POST(request: Request) {
  return eventResponse(async (actorId) => saveReview.execute(actorId, await parseJsonBody(request)));
}
