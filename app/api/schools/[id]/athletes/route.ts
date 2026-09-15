import { prisma } from "@/server/db";
import { RequestSchoolMembership } from "@/modules/school/application/request-school-membership";
import { ListSchoolSportMemberships } from "@/modules/school/application/list-school-sport-memberships";
import { schoolBody, schoolResponse, type SchoolRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestMembership = new RequestSchoolMembership(prisma);
const listMemberships = new ListSchoolSportMemberships(prisma);

export function GET(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => listMemberships.execute(
    actorId, (await context.params).id, "athletes", Object.fromEntries(new URL(request.url).searchParams),
  ));
}

export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    return requestMembership.execute(actorId, (await context.params).id);
  }, 201);
}
