/**
 * SAM-56
 * GET /api/follow-up-policy?schoolId=… — the school's (OWNER/ADMIN) or, without schoolId, the coach's deadlines.
 * PUT /api/follow-up-policy?schoolId=… — save them.
 */
import { prisma } from "@/server/db";
import { GetFollowUpPolicy, SaveFollowUpPolicy } from "@/modules/school/application/follow-up-policy";
import { eventResponse, parseJsonBody } from "../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getPolicy = new GetFollowUpPolicy(prisma);
const savePolicy = new SaveFollowUpPolicy(prisma);

function scopeOf(request: Request) {
  const schoolId = new URL(request.url).searchParams.get("schoolId");
  return schoolId ? { kind: "school", schoolId } : { kind: "coach" };
}

export function GET(request: Request) {
  return eventResponse(async (actorId) => getPolicy.execute(actorId, scopeOf(request)));
}

export function PUT(request: Request) {
  return eventResponse(async (actorId) => savePolicy.execute(actorId, scopeOf(request), await parseJsonBody(request)));
}
