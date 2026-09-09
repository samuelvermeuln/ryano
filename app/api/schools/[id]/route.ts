import { schoolBody, schoolResponse, schools, type SchoolRouteContext } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => schools.get(actorId, (await context.params).id));
}

export function PATCH(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => schools.update(actorId, (await context.params).id, await schoolBody(request)));
}
