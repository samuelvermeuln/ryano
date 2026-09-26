import { prisma } from "@/server/db";
import { GetOrganizationChart } from "@/modules/school/application/get-organization-chart";
import { schoolResponse, type SchoolRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const chart = new GetOrganizationChart(prisma);

export function GET(_request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => chart.execute(actorId, (await context.params).id));
}
