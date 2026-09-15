import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
const cursorPayloadSchema = z.strictObject({ id: idSchema });
const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).refine((value) => {
    try {
      return cursorPayloadSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))).success;
    } catch {
      return false;
    }
  }, "Cursor inválido.").optional(),
});

/** Lists temporal periods and local roles, without exposing user account data. */
export class ListSchoolMembers {
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
    const memberships = new SchoolMembershipRepository(this.db);
    await new CanManageMembers(memberships).assert(actorUserId, schoolId);
    const page = await memberships.listBySchool(schoolId, options);
    const items = await Promise.all(page.items.map(async (membership) => ({
      ...membership,
      roles: await memberships.findRoles(membership.id),
    })));
    return { items, nextCursor: page.nextCursor };
  }
}
