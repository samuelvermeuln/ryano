/** TM039 — Checkout (free path completes immediately; paid path stays PENDING, see design D-02/RF-202). */
import { prisma } from "@/server/db";
import { CreateMarketplaceCheckout } from "@/modules/school/application/create-marketplace-checkout";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolBody, schoolResponse } from "../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const checkout = new CreateMarketplaceCheckout(prisma);

export function POST(request: Request) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    return checkout.execute(actorId, await schoolBody(request));
  }, 201);
}
