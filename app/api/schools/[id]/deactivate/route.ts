import { schoolBody, schoolResponse, schools, type SchoolRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    await schoolBody(request, true);
    return schools.deactivate(actorId, (await context.params).id);
  });
}
