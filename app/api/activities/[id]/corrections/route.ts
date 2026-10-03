/**
 * SAM-73 — POST /api/activities/:id/corrections — { field, correctedValue, reason }
 * or { field: "poolLengthMeters", originalPoolLength, correctedValue, reason }.
 * The athlete who owns the activity, or a coach who reads their current data.
 */
import { prisma } from "@/server/db";
import { RecordActivityCorrection } from "@/modules/shared/activities/application/activity-corrections";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const record = new RecordActivityCorrection(prisma);
type Context = { params: Promise<{ id: string }> };

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => record.execute(actorId, (await context.params).id, await parseJsonBody(request)), 201);
}