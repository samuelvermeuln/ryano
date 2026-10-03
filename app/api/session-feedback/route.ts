/** SAM-61 — POST /api/session-feedback — the athlete's report of a prescribed session or of an activity. */
import { prisma } from "@/server/db";
import { SubmitSessionFeedback } from "@/modules/school/application/session-feedback";
import { eventResponse, parseJsonBody } from "../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submit = new SubmitSessionFeedback(prisma);

export function POST(request: Request) {
  return eventResponse(async (actorId) => submit.execute(actorId, await parseJsonBody(request)));
}
