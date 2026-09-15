import { schoolBody, schoolResponse, schools } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return schoolResponse(async (actorId) => schools.create(actorId, await schoolBody(request)), 201);
}
