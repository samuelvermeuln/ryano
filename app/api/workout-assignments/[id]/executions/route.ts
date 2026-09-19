/**
 * GET  /api/workout-assignments/[id]/executions — list executions for an assignment
 * POST /api/workout-assignments/[id]/executions — manually match an activity (MatchActivityToWorkout)
 */
import { matchActivity, executionResponse, parseJsonBody } from "@/app/api/workout-executions/_shared";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export function POST(request: Request, { params }: RouteContext) {
  return executionResponse(async (actorId) => {
    const { id } = await params;
    const body = await parseJsonBody(request);
    // Inject the assignmentId from the URL into the body
    return matchActivity.execute({ ...body as object, workoutAssignmentId: id });
  }, 201);
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    assertSchoolModuleEnabled();
    const session = await auth();
    if (!session?.user?.id) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const { id } = await params;
    const executions = await prisma.workoutExecution.findMany({
      where: { workoutAssignmentId: id },
      orderBy: { createdAt: "desc" },
    });
    return Response.json(executions);
  } catch (error) {
    if (error instanceof SchoolError) {
      return Response.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return Response.json({ code: "VALIDATION_ERROR", message: "Dados inválidos." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "SCHOOL_MODULE_DISABLED") {
      return Response.json({ code: "SCHOOL_MODULE_DISABLED", message: "Recurso indisponível." }, { status: 404 });
    }
    return Response.json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." }, { status: 500 });
  }
}
