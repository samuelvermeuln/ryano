import { prisma } from "@/server/db";
import { GetCoachPublicProfile } from "@/modules/school/application/get-coach-public-profile";
import { schoolResponse } from "@/app/api/schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const getProfile = new GetCoachPublicProfile(prisma);

type Context = { params: Promise<{ coachId: string }> };

/** SAM-25 — public profile of a coach for the signed-in athlete, with the viewer's own relationship. */
export function GET(_request: Request, context: Context) {
  return schoolResponse(async (actorId) => getProfile.execute(actorId, (await context.params).coachId));
}
