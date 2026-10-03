/** SAM-57 — DELETE /api/unavailability/:id — the athlete removes one of their periods. */
import { prisma } from "@/server/db";
import { AthleteUnavailabilityService } from "@/modules/school/application/athlete-unavailability";
import { eventResponse } from "../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const service = new AthleteUnavailabilityService(prisma);

type Context = { params: Promise<{ id: string }> };

export function DELETE(_request: Request, context: Context) {
  return eventResponse(async (actorId) => service.remove(actorId, (await context.params).id));
}
