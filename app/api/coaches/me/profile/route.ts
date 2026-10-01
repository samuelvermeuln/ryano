import { prisma } from "@/server/db";
import { UpdateCoachProfile } from "@/modules/school/application/update-coach-profile";
import { schoolBody, schoolResponse } from "@/app/api/schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const update = new UpdateCoachProfile(prisma);

/**
 * SAM-28 — the signed-in coach edits their public profile.
 * Body: `{ displayName?, bio?, sportTypes?, credentials?, acceptsIndependentAthletes? }`.
 */
export function PATCH(request: Request) {
  return schoolResponse(async (actorId) => update.execute(actorId, await schoolBody(request)));
}
