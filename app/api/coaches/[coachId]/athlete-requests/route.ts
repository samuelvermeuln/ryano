import { z } from "zod";
import { prisma } from "@/server/db";
import { RequestCoachAssignment } from "@/modules/school/application/request-coach-assignment";
import { schoolOptionalBody, schoolResponse } from "@/app/api/schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestAssignment = new RequestCoachAssignment(prisma);

type Context = { params: Promise<{ coachId: string }> };

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
/** Strict at the boundary: identity or status smuggled in the payload is a 400. */
const bodySchema = z.strictObject({
  schoolId: idSchema.nullish(),
  shareHistory: z.boolean().optional(),
  note: z.string().max(500).nullish(),
});

/** SAM-25 — the athlete asks this coach to follow them (independently or within a shared school). */
export function POST(request: Request, context: Context) {
  return schoolResponse(async (actorId) => {
    const options = bodySchema.parse(await schoolOptionalBody(request));
    return requestAssignment.execute(actorId, (await context.params).coachId, options);
  }, 201);
}
