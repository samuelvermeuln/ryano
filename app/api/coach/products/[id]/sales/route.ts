/**
 * TM027 — `GET /api/coach/products/[id]/sales`: adaptador fino sobre
 * `GetProductSalesSummary` (RF-104 — volume/status/receita agregados,
 * nenhum dado individual de comprador).
 */
import { prisma } from "@/server/db";
import { GetProductSalesSummary } from "@/modules/school/application/get-product-sales-summary";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolResponse, type SchoolRouteContext } from "../../../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const salesSummary = new GetProductSalesSummary(prisma);

export function GET(_request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    const { id: productId } = await context.params;
    return salesSummary.execute(actorId, { productId });
  });
}
