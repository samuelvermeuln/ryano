/** SAM-62 — GET /api/workout-assignments/[id]/match-candidates — activities that could be this session, with the score explained. */
import { executionResponse, listMatchCandidates } from "@/app/api/workout-executions/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return executionResponse(async (actorId) => {
    const { id } = await params;
    return listMatchCandidates.execute(actorId, id);
  });
}
