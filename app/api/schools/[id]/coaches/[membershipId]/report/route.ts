import { prisma } from "@/server/db";
import { GetCoachManagementReport } from "@/modules/school/application/get-coach-management-report";
import { schoolResponse } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const getReport = new GetCoachManagementReport(prisma);
type CoachRouteContext = { params: Promise<{ id: string; membershipId: string }> };

export function GET(request: Request, context: CoachRouteContext) {
  return schoolResponse(async (actorId) => {
    const { id, membershipId } = await context.params;
    return getReport.execute(
      actorId, id, membershipId, Object.fromEntries(new URL(request.url).searchParams),
    );
  });
}
