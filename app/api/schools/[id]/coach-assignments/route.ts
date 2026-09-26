import { z } from "zod";
import { prisma } from "@/server/db";
import { AssignCoachToAthlete } from "@/modules/school/application/assign-coach-to-athlete";
import { ChangeAthleteCoach } from "@/modules/school/application/change-athlete-coach";
import { schoolBody, schoolResponse, type SchoolRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const assignCoach = new AssignCoachToAthlete(prisma);
const changeCoach = new ChangeAthleteCoach(prisma);

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
const bodySchema = z.strictObject({ athleteId: idSchema, coachId: idSchema });
const transferSchema = bodySchema.extend({
  reason: z.string().trim().min(1).max(500).nullish(),
});

/**
 * POST assigns a coach to an athlete who has none; PATCH transfers an athlete
 * who already has one. They are separate verbs because ChangeAthleteCoach ends
 * the previous period and opens a new one atomically, while AssignCoachToAthlete
 * refuses to run when a primary coach already exists.
 */
export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    const { athleteId, coachId } = bodySchema.parse(await schoolBody(request));
    return assignCoach.execute(actorId, (await context.params).id, athleteId, coachId);
  }, 201);
}

export function PATCH(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    const { athleteId, coachId, reason } = transferSchema.parse(await schoolBody(request));
    return changeCoach.execute(actorId, (await context.params).id, athleteId, coachId, reason);
  });
}
