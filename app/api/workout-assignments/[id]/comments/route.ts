import { prisma } from "@/server/db";
import { CommentWorkoutAssignment, ListWorkoutAssignmentComments } from "@/modules/school/application/comment-workout-assignment";
import { parseJsonBody, workoutResponse } from "../../../workouts/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const comment = new CommentWorkoutAssignment(prisma);
const list = new ListWorkoutAssignmentComments(prisma);

/** SAM-27 — the conversation on one prescription (athlete, its coach, school managers). */
export function GET(_request: Request, context: RouteContext) {
  return workoutResponse(async (actorId) => ({ items: await list.execute(actorId, (await context.params).id) }));
}

/** Body: `{ body, kind?: "COMMENT" | "REVIEW_REQUEST" }`. Review requests are the athlete's only. */
export function POST(request: Request, context: RouteContext) {
  return workoutResponse(async (actorId) => comment.execute(actorId, (await context.params).id, await parseJsonBody(request)), 201);
}
