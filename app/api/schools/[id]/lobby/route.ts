import { z } from "zod";
import { prisma } from "@/server/db";
import { ListLobbyAthletes } from "@/modules/school/application/list-lobby-athletes";
import { schoolResponse, type SchoolRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const querySchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().min(1).max(2048).optional() });
const lobby = new ListLobbyAthletes(prisma);

export function GET(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return lobby.execute(actorId, (await context.params).id, query);
  });
}
