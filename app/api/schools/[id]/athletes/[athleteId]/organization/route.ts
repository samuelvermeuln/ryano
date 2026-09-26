import { prisma } from "@/server/db";
import { GetAthleteOrganizationDetail } from "@/modules/school/application/get-athlete-organization-detail";
import { schoolResponse } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const detail = new GetAthleteOrganizationDetail(prisma);
type AthleteRouteContext = { params: Promise<{ id: string; athleteId: string }> };

export function GET(_request: Request, context: AthleteRouteContext) {
  return schoolResponse(async (actorId) => {
    const { id, athleteId } = await context.params;
    return detail.execute(actorId, id, athleteId);
  });
}
