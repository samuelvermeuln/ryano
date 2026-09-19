/**
 * GET  /api/workout-assignments/[id]/compliance
 *   Returns the compliance record for the most recent confirmed/overridden execution.
 *
 * POST /api/workout-assignments/[id]/compliance/recalculate (see recalculate/route.ts)
 */
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { WorkoutMatchStatus } from "@/modules/school/domain/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    assertSchoolModuleEnabled();
    const session = await auth();
    if (!session?.user?.id) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);

    const { id: assignmentId } = await params;

    // Return compliance for the best execution (confirmed > overridden > auto_matched)
    const statusPriority: string[] = [
      WorkoutMatchStatus.CONFIRMED,
      WorkoutMatchStatus.OVERRIDDEN,
      WorkoutMatchStatus.AUTO_MATCHED,
    ];

    const compliance = await prisma.workoutCompliance.findFirst({
      where: { workoutAssignmentId: assignmentId },
      orderBy: [{ calculatedAt: "desc" }],
      include: {
        execution: {
          select: { matchStatus: true, startedAt: true, matchScore: true },
        },
      },
    });

    if (!compliance) {
      return Response.json({ code: "COMPLIANCE_NOT_FOUND", message: "Nenhum resultado de compliance calculado para esta prescrição." }, { status: 404 });
    }

    return Response.json(compliance);
  } catch (error) {
    if (error instanceof SchoolError) {
      return Response.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "SCHOOL_MODULE_DISABLED") {
      return Response.json({ code: "SCHOOL_MODULE_DISABLED", message: "Recurso indisponível." }, { status: 404 });
    }
    return Response.json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." }, { status: 500 });
  }
}
