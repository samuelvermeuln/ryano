import { z } from "zod";
import { prisma } from "@/server/db";
import { RequestSchoolMembership } from "@/modules/school/application/request-school-membership";
import { ListSchoolSportMemberships } from "@/modules/school/application/list-school-sport-memberships";
import { schoolOptionalBody, schoolResponse, type SchoolRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestMembership = new RequestSchoolMembership(prisma);
const listMemberships = new ListSchoolSportMemberships(prisma);

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
/**
 * SAM-24 — options the athlete picks in the "Associar-se" modal. Strict, so a
 * payload trying to smuggle identity or status fields is a 400 at the
 * boundary; the use case validates again and applies the defaults.
 */
const requestBodySchema = z.strictObject({
  shareHistory: z.boolean().optional(),
  preferredCoachId: idSchema.nullish(),
});

export function GET(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => listMemberships.execute(
    actorId, (await context.params).id, "athletes", Object.fromEntries(new URL(request.url).searchParams),
  ));
}

export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    const options = requestBodySchema.parse(await schoolOptionalBody(request));
    return requestMembership.execute(actorId, (await context.params).id, options);
  }, 201);
}
