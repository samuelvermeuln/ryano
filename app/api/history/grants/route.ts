import { prisma } from "@/server/db";
import { GrantHistoryAccess, grantHistoryAccessSchema } from "@/modules/school/application/grant-history-access";
import { ListHistoryGrants, listHistoryGrantsSchema } from "@/modules/school/application/list-history-grants";
import { historyGrantResponse, schoolBody } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const grantHistory = new GrantHistoryAccess(prisma);
const listGrants = new ListHistoryGrants(prisma);

export function POST(request: Request) {
  return historyGrantResponse(async (actorId) => grantHistory.execute(
    actorId, grantHistoryAccessSchema.parse(await schoolBody(request)),
  ), 201);
}

export function GET(request: Request) {
  return historyGrantResponse(async (actorId) => listGrants.execute(
    actorId, listHistoryGrantsSchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
  ));
}
