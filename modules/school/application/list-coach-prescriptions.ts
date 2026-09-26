import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";
import { resolveSchoolCoach } from "./resolve-school-coach";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
const cursorPayloadSchema = z.strictObject({ createdAt: z.string(), id: idSchema });

const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(WorkoutAssignmentStatus).optional(),
  athleteId: idSchema.optional(),
  cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).refine((value) => {
    try {
      return cursorPayloadSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))).success;
    } catch {
      return false;
    }
  }, "Cursor inválido.").optional(),
});

function decodeCursor(cursor: string) {
  const { createdAt, id } = cursorPayloadSchema.parse(
    JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
  );
  return { createdAt: new Date(createdAt), id };
}

/**
 * Prescriptions a coach issued inside one school, most recent first.
 *
 * Ordered by `createdAt`, not `scheduledAt`: the latter is nullable (template-
 * based assignments from the license calendar carry no date), and a null sort
 * key cannot anchor a cursor. The composite (createdAt, id) keeps the page
 * boundary stable when several assignments share a timestamp.
 */
export class ListCoachPrescriptions {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string, raw: unknown = {}) {
    if (!idSchema.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!idSchema.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    if (!idSchema.safeParse(membershipId).success) {
      throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", "Vínculo do professor não encontrado.", 404);
    }
    const options = querySchema.parse(raw);

    const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    await new CanManageMembers(new SchoolMembershipRepository(this.db)).assert(actorUserId, school.id);
    const { coachId } = await resolveSchoolCoach(this.db, school.id, membershipId);

    const after = options.cursor ? decodeCursor(options.cursor) : null;
    const rows = await this.db.workoutAssignment.findMany({
      where: {
        schoolId: school.id,
        coachId,
        ...(options.status ? { status: options.status } : {}),
        ...(options.athleteId ? { athleteId: options.athleteId } : {}),
        ...(after
          ? {
            OR: [
              { createdAt: { lt: after.createdAt } },
              { createdAt: after.createdAt, id: { lt: after.id } },
            ],
          }
          : {}),
      },
      select: {
        id: true, athleteId: true, scheduledAt: true, dueAt: true, status: true,
        matchStatus: true, matchedAt: true, sourceLabel: true, createdAt: true,
        workout: { select: { id: true, title: true, sportType: true } },
        athlete: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
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
