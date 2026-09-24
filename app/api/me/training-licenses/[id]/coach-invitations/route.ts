/**
 * TM077 — `POST /api/me/training-licenses/[id]/coach-invitations`: thin
 * adapter over `InviteCoachToLicense` (RF-301). licenseId always from the
 * URL, never the body (same discipline as TM042's activate/route.ts).
 */
import { prisma } from "@/server/db";
import { InviteCoachToLicense } from "@/modules/school/application/invite-coach-to-license";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolBody, schoolResponse, type SchoolRouteContext } from "../../../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const invite = new InviteCoachToLicense(prisma);

export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    const { id: licenseId } = await context.params;
    return invite.execute(actorId, { ...(await schoolBody(request) as Record<string, unknown>), licenseId });
  }, 201);
}
