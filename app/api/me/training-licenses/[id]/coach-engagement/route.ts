/**
 * TM081 — `DELETE /api/me/training-licenses/[id]/coach-engagement`: thin
 * adapter over `RevokeCoachEngagement` (RF-304). licenseId from the URL; an
 * optional `?coachId=` query param disambiguates when more than one coach is
 * actively following the license (RF-305). A query param, not a body — DELETE
 * request bodies are unreliable across HTTP clients.
 */
import { prisma } from "@/server/db";
import { RevokeCoachEngagement } from "@/modules/school/application/revoke-coach-engagement";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolResponse, type SchoolRouteContext } from "../../../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const revoke = new RevokeCoachEngagement(prisma);

export function DELETE(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    const { id: licenseId } = await context.params;
    const coachId = new URL(request.url).searchParams.get("coachId");
    return revoke.execute(actorId, { licenseId, ...(coachId ? { coachId } : {}) });
  });
}
