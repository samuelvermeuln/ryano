/**
 * TM033 — `GET /api/marketplace/products` (RF-105). Thin adapter over
 * `ListMarketplaceProducts` (TM031): auth/parse/delegate only, no business
 * logic here. Explicitly public (`publicSchoolResponse`, no session) — a
 * visitor browses the catalog without an account per RF-105 — and behind
 * `assertMarketplaceEnabled()` (RNF-009).
 */
import { prisma } from "@/server/db";
import { ListMarketplaceProducts, listMarketplaceProductsQuerySchema } from "@/modules/school/application/list-marketplace-products";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { publicSchoolResponse } from "../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const list = new ListMarketplaceProducts(prisma);

export function GET(request: Request) {
  return publicSchoolResponse(async () => {
    assertMarketplaceEnabled();
    // Malformed/out-of-range query values are normalized away rather than
    // ever reaching the DB query — `listMarketplaceProductsQuerySchema.parse`
    // throws (→ 400 via the envelope's ZodError branch) instead of silently
    // exposing a broader result than intended.
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return list.execute(listMarketplaceProductsQuerySchema.parse(params));
  });
}
