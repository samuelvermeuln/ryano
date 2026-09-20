/**
 * GET /api/schools/[id]/audit-logs
 *
 * Returns paginated school audit logs.
 * Query params:
 *   entityType — filter by entity type (optional)
 *   entityId   — filter by entity id (optional)
 *   limit      — page size (default 50, max 200)
 *   before     — ISO timestamp cursor for keyset pagination
 */
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  try {
    assertSchoolModuleEnabled();
    const session = await auth();
    if (!session?.user?.id) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);

    const { id: schoolId } = await params;
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType") ?? undefined;
    const entityId   = url.searchParams.get("entityId") ?? undefined;
    const before     = url.searchParams.get("before") ? new Date(url.searchParams.get("before")!) : undefined;
    const limit      = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

    // Require admin/owner membership to read audit logs
    const membership = await prisma.schoolMembership.findFirst({
      where: { schoolId, userId: session.user.id, isActive: true },
      include: { roles: { select: { role: true } } },
    });
    const isAuthorized = membership?.roles.some((r) => ["OWNER", "ADMIN"].includes(r.role));
    if (!isAuthorized) throw new SchoolError("FORBIDDEN", "Apenas administradores podem visualizar os logs de auditoria.", 403);

    const logs = await prisma.schoolAuditLog.findMany({
      where: {
        schoolId,
        ...(entityType && { entityType }),
        ...(entityId && { entityId }),
        ...(before && { createdAt: { lt: before } }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return Response.json({
      data: logs,
      nextCursor: logs.length === limit ? logs[logs.length - 1]?.createdAt.toISOString() : null,
    });
  } catch (error) {
    if (error instanceof SchoolError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "SCHOOL_MODULE_DISABLED") return Response.json({ code: "SCHOOL_MODULE_DISABLED", message: "Recurso indisponível." }, { status: 404 });
    return Response.json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." }, { status: 500 });
  }
}
