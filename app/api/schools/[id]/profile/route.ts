import { prisma } from "@/server/db";
import { GetSchoolPublicProfile } from "@/modules/school/application/get-school-public-profile";
import { schoolResponse, type SchoolRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const getProfile = new GetSchoolPublicProfile(prisma);

/**
 * SAM-24 — public profile of a school for the signed-in athlete, including the
 * viewer's own relationship with it. Requires a session: the contact data the
 * school registered is for people on the platform, not for crawlers.
 */
export function GET(_request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => getProfile.execute(actorId, (await context.params).id));
}
