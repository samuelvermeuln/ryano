import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { MatchActivityToWorkout } from "@/modules/school/application/match-activity-to-workout";
import { ConfirmWorkoutMatch, OverrideWorkoutMatch, UnmatchActivity } from "@/modules/school/application/manage-workout-match";

export const matchActivity = new MatchActivityToWorkout(prisma);
export const confirmMatch = new ConfirmWorkoutMatch(prisma);
export const overrideMatch = new OverrideWorkoutMatch(prisma);
export const unmatchActivity = new UnmatchActivity(prisma);

export type ExecutionRouteContext = { params: Promise<{ id: string }> };

export async function executionResponse(operation: (actorId: string) => Promise<unknown>, status = 200) {
  try {
    assertSchoolModuleEnabled();
    const session = await auth();
    if (!session?.user?.id) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    return Response.json(await operation(session.user.id), { status });
  } catch (error) {
    if (error instanceof SchoolError) {
      return Response.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return Response.json({
        code: "VALIDATION_ERROR", message: "Dados inválidos.",
        details: error.issues.map(({ code, path, message }) => ({ code, path, message })),
      }, { status: 400 });
    }
    if (error instanceof Error && error.message === "SCHOOL_MODULE_DISABLED") {
      return Response.json({ code: "SCHOOL_MODULE_DISABLED", message: "Recurso indisponível." }, { status: 404 });
    }
    return Response.json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." }, { status: 500 });
  }
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  try { return text.length === 0 ? {} : JSON.parse(text); }
  catch { throw new SchoolError("VALIDATION_ERROR", "Informe um corpo JSON válido.", 400); }
}
