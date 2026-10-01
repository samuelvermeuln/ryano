import { prisma } from "@/server/db";
import { ReportWorkoutAbsence } from "@/modules/school/application/report-workout-absence";
import { parseJsonBody, workoutResponse } from "../../../workouts/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const report = new ReportWorkoutAbsence(prisma);

/** SAM-27 — the athlete reports they will not / did not do it. `{ reason? }` → JUSTIFIED, without → MISSED. */
export function POST(request: Request, context: RouteContext) {
  return workoutResponse(async (actorId) => report.execute(actorId, (await context.params).id, await parseJsonBody(request)));
}
