/**
 * TM078 — `POST /api/coach/plan-invitations/[id]/accept`: thin adapter over
 * `AcceptCoachInvitation` (RF-302). `id` (from the URL) is the
 * `LicenseCoachEngagement.id` — identity is verified server-side against the
 * session's own CoachProfile, never trusted from the URL/body.
 */
import { prisma } from "@/server/db";
import { AcceptCoachInvitation } from "@/modules/school/application/accept-coach-invitation";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolResponse, type SchoolRouteContext } from "../../../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const accept = new AcceptCoachInvitation(prisma);

export function POST(_request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    const { id: engagementId } = await context.params;
    return accept.execute(actorId, { engagementId });
  });
}
