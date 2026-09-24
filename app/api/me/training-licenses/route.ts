/** TM040 — the caller's own training licenses + pending paid purchases (never another athlete's, RF-111). */
import { prisma } from "@/server/db";
import { ListMyTrainingLicenses } from "@/modules/school/application/list-my-training-licenses";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolResponse } from "../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const list = new ListMyTrainingLicenses(prisma);

export function GET(request: Request) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return list.execute(actorId, {
      ...params,
      limit: params.limit !== undefined ? Number(params.limit) : undefined,
    });
  });
}
