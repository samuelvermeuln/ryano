import { prisma } from "@/server/db";
import { ListCoachPrescriptions } from "@/modules/school/application/list-coach-prescriptions";
import { schoolResponse } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const listPrescriptions = new ListCoachPrescriptions(prisma);
type CoachRouteContext = { params: Promise<{ id: string; membershipId: string }> };

export function GET(request: Request, context: CoachRouteContext) {
  return schoolResponse(async (actorId) => {
    const { id, membershipId } = await context.params;
    return listPrescriptions.execute(
      actorId, id, membershipId, Object.fromEntries(new URL(request.url).searchParams),
    );
  });
}
