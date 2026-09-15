import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CoachSchoolMembershipRepository } from "../infrastructure/coach-school-membership-repository";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const cursorPayload = z.strictObject({ id });
const query = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).refine((value) => {
    try {
      return cursorPayload.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))).success;
    } catch {
      return false;
    }
  }, "Cursor inválido.").optional(),
});

/** Management-only lists of temporal periods; no private athlete or account data. */
export class ListSchoolSportMemberships {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, schoolId: string, kind: "coaches" | "athletes", raw: unknown = {}) {
    if (!id.safeParse(actorUserId).success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (!id.safeParse(schoolId).success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const options = query.parse(raw);
    const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    await new CanManageMembers(new SchoolMembershipRepository(this.db)).assert(actorUserId, schoolId);
    const repository = kind === "coaches"
      ? new CoachSchoolMembershipRepository(this.db)
      : new SchoolAthleteMembershipRepository(this.db);
    return repository.listBySchool(schoolId, options);
  }
}
