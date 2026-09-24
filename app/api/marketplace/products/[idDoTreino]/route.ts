/**
 * TM034 — `GET /api/marketplace/products/[idDoTreino]` (RF-106). Thin
 * adapter over `GetMarketplaceProductDetail` (TM032): auth/parse/delegate
 * only. Explicitly public (`publicSchoolResponse`, no session) and behind
 * `assertMarketplaceEnabled()` (RNF-009).
 *
 * SEO/canonical safety (this task's own criterion) is enforced at the page
 * level (`app/marketplace/[idDoTreino]/page.tsx`'s `generateMetadata`,
 * TM036) — a route handler has no `generateMetadata` hook. What THIS route
 * guarantees is the precondition that makes that safe: the DTO returned here
 * is the exact same authorization-aware `GetMarketplaceProductDetail` call
 * the page uses for its metadata, so there is no separate, unguarded query
 * anywhere that could leak a private/SCHOOL_ONLY product's title/description
 * into a `<meta>` tag.
 */
import { prisma } from "@/server/db";
import { GetMarketplaceProductDetail } from "@/modules/school/application/get-marketplace-product-detail";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { publicSchoolResponse } from "../../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const detail = new GetMarketplaceProductDetail(prisma);

export function GET(_request: Request, context: { params: Promise<{ idDoTreino: string }> }) {
  return publicSchoolResponse(async () => {
    assertMarketplaceEnabled();
    const { idDoTreino } = await context.params;
    return detail.execute({ idOrSlug: idDoTreino });
  });
}
