/** TM042 — thin adapter over ActivateTrainingLicense; licenseId always from the URL, never the body. */
import { prisma } from "@/server/db";
import { ActivateTrainingLicense } from "@/modules/school/application/activate-training-license";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolBody, schoolResponse } from "../../../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const activate = new ActivateTrainingLicense(prisma);

type ActivateRouteContext = { params: Promise<{ id: string }> };

export function POST(request: Request, context: ActivateRouteContext) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    return activate.execute(actorId, {
      ...(await schoolBody(request) as Record<string, unknown>),
      licenseId: (await context.params).id,
    });
  });
}
