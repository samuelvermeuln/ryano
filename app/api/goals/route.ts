/**
 * SAM-53
 * GET  /api/goals?athleteId=… — desired × agreed pairs with their revisions (default: me).
 * POST /api/goals            — create a wish (athlete or coach on the athlete's behalf) or an agreed goal (coach).
 */
import { prisma } from "@/server/db";
import { CreateAthleteGoal, ListAthleteGoals } from "@/modules/school/application/athlete-goals";
import { eventResponse, parseJsonBody } from "../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createGoal = new CreateAthleteGoal(prisma);
const listGoals = new ListAthleteGoals(prisma);

export function GET(request: Request) {
  return eventResponse(async (actorId) => listGoals.execute(actorId, new URL(request.url).searchParams.get("athleteId") ?? actorId));
}

export function POST(request: Request) {
  return eventResponse(async (actorId) => createGoal.execute(actorId, await parseJsonBody(request)), 201);
}
