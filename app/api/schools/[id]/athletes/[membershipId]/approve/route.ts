import { z } from "zod";
import { prisma } from "@/server/db";
import { ApproveAthleteMembership } from "@/modules/school/application/approve-athlete-membership";
import { schoolOptionalBody, schoolResponse } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const operation = new ApproveAthleteMembership(prisma);
type MembershipRouteContext = { params: Promise<{ id: string; membershipId: string }> };

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
/** SAM-26 — optional coach to assign on approval; strict so status/identity in the payload is a 400. */
const bodySchema = z.strictObject({ coachId: idSchema.nullish() });

export function POST(request: Request, context: MembershipRouteContext) {
  return schoolResponse(async (actorId) => {
    const options = bodySchema.parse(await schoolOptionalBody(request));
    const { id, membershipId } = await context.params;
    return operation.execute(actorId, id, membershipId, options);
  });
}
