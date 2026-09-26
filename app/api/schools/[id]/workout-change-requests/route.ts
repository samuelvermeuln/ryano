import { prisma } from "@/server/db";
import { ListWorkoutChangeRequests } from "@/modules/school/application/list-workout-change-requests";
import { RequestWorkoutChange, requestWorkoutChangeSchema } from "@/modules/school/application/request-workout-change";
import { schoolBody, schoolResponse, type SchoolRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const listChangeRequests = new ListWorkoutChangeRequests(prisma);
const requestChange = new RequestWorkoutChange(prisma);

export function GET(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => listChangeRequests.execute(
    actorId, (await context.params).id, Object.fromEntries(new URL(request.url).searchParams),
  ));
}

export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => requestChange.execute(
    actorId, (await context.params).id, requestWorkoutChangeSchema.parse(await schoolBody(request)),
  ), 201);
}
