/**
 * SAM-62 — POST /api/workout-assignments/[id]/link-activity
 * Body `{ activityId, mode: "replace" | "add", reason? }`: link an imported
 * activity to the session (replace the current one or add a piece of it).
 */
import { executionResponse, linkActivity, parseJsonBody } from "@/app/api/workout-executions/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return executionResponse(async (actorId) => {
    const { id } = await params;
    const body = (await parseJsonBody(request)) as Record<string, unknown>;
    return linkActivity.execute(actorId, { ...body, assignmentId: id });
  });
}
