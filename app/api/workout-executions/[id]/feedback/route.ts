/**
 * T230 — Athlete feedback endpoint
 *
 * POST  /api/workout-executions/[id]/feedback  — SubmitAthleteFeedback (upsert)
 * GET   /api/workout-executions/[id]/feedback  — read feedback for execution
 */
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { SubmitAthleteFeedback } from "@/modules/school/application/manage-evaluation";

const submitFeedback = new SubmitAthleteFeedback(prisma);

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
    return submitFeedback.execute(actorId, { ...await parseBody(request), workoutExecutionId: id });
  }, 201);
}

export async function GET(_req: Request, { params }: RouteContext) {
  return respond(async () => {
    const { id } = await params;
    const feedback = await prisma.athleteFeedback.findUnique({ where: { workoutExecutionId: id } });
    if (!feedback) return Response.json({ code: "FEEDBACK_NOT_FOUND", message: "Nenhum feedback enviado." }, { status: 404 });
    return feedback;
  });
}
