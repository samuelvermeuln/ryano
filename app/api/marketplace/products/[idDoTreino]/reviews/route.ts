/**
 * TM048 — `POST /api/marketplace/products/[idDoTreino]/reviews` (RF-112).
 * Thin adapter over `CreateMarketplaceReview` (TM047): auth/parse/delegate only.
 */
import { prisma } from "@/server/db";
import { CreateMarketplaceReview } from "@/modules/school/application/create-marketplace-review";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolBody, schoolResponse } from "../../../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reviews = new CreateMarketplaceReview(prisma);

export function POST(request: Request, context: { params: Promise<{ idDoTreino: string }> }) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    const { idDoTreino } = await context.params;
    const body = (await schoolBody(request)) as Record<string, unknown>;
    return reviews.execute(actorId, { ...body, productId: idDoTreino });
  }, 201);
}
