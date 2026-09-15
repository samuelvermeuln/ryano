import { prisma } from "@/server/db";
import { AddSchoolMember, addSchoolMemberSchema } from "@/modules/school/application/add-school-member";
import { ListSchoolMembers } from "@/modules/school/application/list-school-members";
import { schoolBody, schoolResponse, type SchoolRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const listMembers = new ListSchoolMembers(prisma);
const addMember = new AddSchoolMember(prisma);

export function GET(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => listMembers.execute(
    actorId, (await context.params).id, Object.fromEntries(new URL(request.url).searchParams),
  ));
}

export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => addMember.execute(
    actorId, (await context.params).id, addSchoolMemberSchema.parse(await schoolBody(request)),
  ), 201);
}
