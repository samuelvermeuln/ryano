import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutChangeRequestStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
const cursorPayloadSchema = z.strictObject({ createdAt: z.string(), id: idSchema });
const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(WorkoutChangeRequestStatus).optional(),
  coachId: idSchema.optional(),
  cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).refine((value) => {
    try {
      return cursorPayloadSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))).success;
    } catch {
      return false;
    }
  }, "Cursor inválido.").optional(),
});

/** Change requests opened by this school, most recent first. */
export class ListWorkoutChangeRequests {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, schoolId: string, raw: unknown = {}) {
    if (!idSchema.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!idSchema.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    const options = querySchema.parse(raw);

    const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    await new CanManageMembers(new SchoolMembershipRepository(this.db)).assert(actorUserId, school.id);

    const after = options.cursor
      ? cursorPayloadSchema.parse(JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")))
      : null;

    const rows = await this.db.workoutChangeRequest.findMany({
      where: {
        schoolId: school.id,
        ...(options.status ? { status: options.status } : {}),
        ...(options.coachId ? { coachId: options.coachId } : {}),
        ...(after
          ? {
            OR: [
              { createdAt: { lt: new Date(after.createdAt) } },
              { createdAt: new Date(after.createdAt), id: { lt: after.id } },
            ],
          }
          : {}),
      },
      select: {
        id: true, workoutAssignmentId: true, coachId: true, requestedBy: true,
        reason: true, status: true, resolvedBy: true, resolvedAt: true,
        resolutionNote: true, createdAt: true, updatedAt: true,
        coach: { select: { id: true, displayName: true } },
        requester: { select: { id: true, name: true, email: true } },
        workoutAssignment: {
          select: {
            id: true, scheduledAt: true, status: true, sourceLabel: true,
            workout: { select: { title: true, sportType: true } },
            athlete: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options.limit + 1,
    });

    const items = rows.slice(0, options.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > options.limit && last
        ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url")
        : null,
    };
  }
}
