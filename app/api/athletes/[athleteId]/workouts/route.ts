import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { WorkoutAssignmentRepository } from "@/modules/school/infrastructure/workout-assignment-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ athleteId: z.string().min(1).max(256) });
const querySchema = z.object({
  cursor: z.string().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const repo = new WorkoutAssignmentRepository(prisma);

export async function GET(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  try {
    assertSchoolModuleEnabled();
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ code: "UNAUTHORIZED", message: "Entre na sua conta para continuar." }, { status: 401 });
    }

    const { athleteId } = paramsSchema.parse(await params);
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(searchParams.entries()));

    // Athletes can only list their own workouts; coaches see theirs via /api/schools routes.
    if (session.user.id !== athleteId) {
      return Response.json({ code: "FORBIDDEN", message: "Você não pode acessar os treinos deste atleta." }, { status: 403 });
    }

    const result = await repo.listByAthlete(athleteId, { cursor: query.cursor, limit: query.limit });
    return Response.json(result);
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
