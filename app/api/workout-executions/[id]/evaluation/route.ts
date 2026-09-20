/**
 * T229 — Coach evaluation endpoints
 *
 * POST   /api/workout-executions/[id]/evaluation   — CreateCoachEvaluation
 * PATCH  /api/workout-executions/[id]/evaluation   — UpdateCoachEvaluation
 * GET    /api/workout-executions/[id]/evaluation   — list evaluations for execution
 */
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { CreateCoachEvaluation, UpdateCoachEvaluation } from "@/modules/school/application/manage-evaluation";

const createEval = new CreateCoachEvaluation(prisma);
const updateEval = new UpdateCoachEvaluation(prisma);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function respond(op: (actorId: string) => Promise<unknown>, status = 200) {
  try {
    assertSchoolModuleEnabled();
    const session = await auth();
    if (!session?.user?.id) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    return Response.json(await op(session.user.id), { status });
  } catch (e) {
    if (e instanceof SchoolError) return Response.json({ code: e.code, message: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return Response.json({ code: "VALIDATION_ERROR", message: "Dados inválidos.", details: e.issues }, { status: 400 });
    if (e instanceof Error && e.message === "SCHOOL_MODULE_DISABLED") return Response.json({ code: "SCHOOL_MODULE_DISABLED", message: "Recurso indisponível." }, { status: 404 });
    return Response.json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." }, { status: 500 });
  }
}

async function parseBody(req: Request) {
  const t = await req.text();
  try { return t.length === 0 ? {} : JSON.parse(t); } catch { throw new SchoolError("VALIDATION_ERROR", "JSON inválido.", 400); }
}

export function POST(request: Request, { params }: RouteContext) {
  return respond(async (actorId) => {
    const { id } = await params;
    return createEval.execute(actorId, { ...await parseBody(request), workoutExecutionId: id });
  }, 201);
}

export function PATCH(request: Request, { params }: RouteContext) {
  return respond(async (actorId) => {
    const { id } = await params;
    const body = await parseBody(request);
    return updateEval.execute(actorId, { ...body as object, evaluationId: (body as Record<string, unknown>).evaluationId ?? id });
  });
}

export async function GET(_req: Request, { params }: RouteContext) {
  return respond(async (actorId) => {
    const { id } = await params;
    // Scope: coaches see their own evaluations for this execution; athletes see visible ones only.
    // Any other caller sees nothing rather than an error — reduces information leakage.
    const execution = await prisma.workoutExecution.findUnique({
      where: { id },
      select: { athleteId: true, assignment: { select: { schoolId: true } } },
    });
    if (!execution) return [];
    const isAthlete = execution.athleteId === actorId;
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actorId }, select: { id: true } });
    const isCoach = !!coachProfile;
    return prisma.coachEvaluation.findMany({
      where: {
        workoutExecutionId: id,
        ...(isAthlete ? { isVisible: true }
          : isCoach ? { coachId: coachProfile.id }
          : { id: "none" /* no results for unrelated users */ }),
      },
      orderBy: { createdAt: "desc" },
    });
  });
}
