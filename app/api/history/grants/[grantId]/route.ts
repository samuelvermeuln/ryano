import { prisma } from "@/server/db";
import { grantHistoryAccessSchema } from "@/modules/school/application/grant-history-access";
import { UpdateHistoryGrant, updateHistoryGrantSchema } from "@/modules/school/application/update-history-grant";
import { RevokeHistoryAccess, revokeHistoryAccessSchema } from "@/modules/school/application/revoke-history-access";
import { historyGrantResponse, schoolBody, type HistoryGrantRouteContext } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const updateGrant = new UpdateHistoryGrant(prisma);
const revokeGrant = new RevokeHistoryAccess(prisma);
const updateBodySchema = grantHistoryAccessSchema.pick({ scope: true, fromDate: true, toDate: true }).partial();

export function PATCH(request: Request, context: HistoryGrantRouteContext) {
  return historyGrantResponse(async (actorId) => {
    const { grantId } = await context.params;
    const body = updateBodySchema.parse(await schoolBody(request));
    return updateGrant.execute(actorId, updateHistoryGrantSchema.parse({ ...body, grantId }));
  });
}

export function DELETE(request: Request, context: HistoryGrantRouteContext) {
  return historyGrantResponse(async (actorId) => {
    await schoolBody(request, true);
    const { grantId } = await context.params;
    return revokeGrant.execute(actorId, revokeHistoryAccessSchema.parse({ grantId }));
  });
}
