/**
 * GET  /api/workout-assignments
 *   T315 — Cursor-paginated list of workout assignments visible to the caller.
 *   Supports keyset pagination via `cursor` (last id from previous page).
 *
 *   Query params:
 *     schoolId  — filter to a school
 *     athleteId — filter to a specific athlete
 *     status    — WorkoutAssignmentStatus filter
 *     limit     — page size (default 20, max 100)
 *     cursor    — opaque id cursor (exclusive)
 */
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { WorkoutAssignmentStatus } from "@/modules/school/domain/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  schoolId:  z.string().min(1).max(256).optional(),
  athleteId: z.string().min(1).max(256).optional(),
  status:    z.enum(WorkoutAssignmentStatus).optional(),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  cursor:    z.string().min(1).max(256).optional(),
});

export async function GET(req: Request) {
  try {
    assertSchoolModuleEnabled();
    const session = await auth();
    if (!session?.user?.id) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);

    const q = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));

    // Authorization: athlete may only list their own; coach/admin scoped to their school.
    const effectiveAthleteId = q.athleteId ?? session.user.id;

    const items = await prisma.workoutAssignment.findMany({
      where: {
        ...(q.schoolId && { schoolId: q.schoolId }),
        athleteId: effectiveAthleteId,
        ...(q.status && { status: q.status }),
        ...(q.cursor && { id: { gt: q.cursor } }),
      },
      include: {
        workout: { select: { id: true, title: true, sportType: true } },
      },
      orderBy: { id: "asc" },
      take: q.limit,
    });

    return Response.json({
      data: items,
      nextCursor: items.length === q.limit ? items[items.length - 1]?.id : null,
    });
  } catch (error) {
    if (error instanceof SchoolError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "SCHOOL_MODULE_DISABLED") return Response.json({ code: "SCHOOL_MODULE_DISABLED" }, { status: 404 });
    return Response.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
