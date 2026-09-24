/**
 * TM026 — `POST /api/coach/products/[id]/publish`: adaptador fino sobre
 * `PublishTrainingProductVersion` (RF-103).
 */
import { prisma } from "@/server/db";
import { PublishTrainingProductVersion } from "@/modules/school/application/publish-training-product-version";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolResponse, type SchoolRouteContext } from "../../../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publishVersion = new PublishTrainingProductVersion(prisma);

export function POST(_request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    const { id: productId } = await context.params;
    return publishVersion.execute(actorId, { productId });
  });
}
