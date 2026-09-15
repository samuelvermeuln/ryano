import { prisma } from "@/server/db";
import { RejoinSchool } from "@/modules/school/application/rejoin-school";
import { schoolBody, schoolResponse, type SchoolRouteContext } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const rejoin = new RejoinSchool(prisma);

export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    return rejoin.execute(actorId, (await context.params).id);
  }, 201);
}
