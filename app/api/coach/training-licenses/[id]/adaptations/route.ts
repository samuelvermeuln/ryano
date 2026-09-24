/**
 * TM079 — `POST /api/coach/training-licenses/[id]/adaptations`: thin adapter
 * over `ProposePlanAdaptation` (RF-303). licenseId always from the URL. Only
 * a coach with an ACTIVE `LicenseCoachEngagement` on this license may call
 * this — enforced inside the use case, not here (RNF-001, every route has
 * its own server-side check regardless of what any layout guard already did).
 */
import { prisma } from "@/server/db";
import { ProposePlanAdaptation } from "@/modules/school/application/propose-plan-adaptation";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolBody, schoolResponse, type SchoolRouteContext } from "../../../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const propose = new ProposePlanAdaptation(prisma);

export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    const { id: licenseId } = await context.params;
    return propose.execute(actorId, { ...(await schoolBody(request) as Record<string, unknown>), licenseId });
  }, 201);
}
