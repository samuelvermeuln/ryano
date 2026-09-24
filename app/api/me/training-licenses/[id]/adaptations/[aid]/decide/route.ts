/**
 * TM080 — `POST /api/me/training-licenses/[id]/adaptations/[aid]/decide`:
 * thin adapter over `DecidePlanAdaptation` (RF-303). licenseId/adaptationId
 * always from the URL, never the body.
 */
import { prisma } from "@/server/db";
import { DecidePlanAdaptation } from "@/modules/school/application/decide-plan-adaptation";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolBody, schoolResponse } from "../../../../../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const decide = new DecidePlanAdaptation(prisma);

type RouteContext = { params: Promise<{ id: string; aid: string }> };

export function POST(request: Request, context: RouteContext) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    const { id: licenseId, aid: adaptationId } = await context.params;
    return decide.execute(actorId, { ...(await schoolBody(request) as Record<string, unknown>), licenseId, adaptationId });
  });
}
