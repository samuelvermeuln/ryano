/**
 * SAM-78 — POST /api/schools/:id/catalog-roles — { coachId, role: EDITOR | REVIEWER | READER | null }.
 */
import { prisma } from "@/server/db";
import { SetCatalogRole } from "@/modules/school/application/workout-catalog-collaboration";
import { eventResponse, parseJsonBody } from "../../../events/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const setRole = new SetCatalogRole(prisma);
type Context = { params: Promise<{ id: string }> };

export function POST(request: Request, context: Context) {
  return eventResponse(async (actorId) => setRole.execute(actorId, (await context.params).id, await parseJsonBody(request)));
}