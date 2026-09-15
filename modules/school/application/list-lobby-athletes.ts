import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { CanManageMembers } from "./can-manage-members";
import { SchoolLobbyQuery } from "../infrastructure/school-lobby-query";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
export class ListLobbyAthletes {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, schoolId: string, options: { limit?: number; cursor?: string } = {}) {
    if (!id.safeParse(actorUserId).success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (!id.safeParse(schoolId).success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { ownerUserId: true } });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    await new CanManageMembers(new SchoolMembershipRepository(this.db)).assert(actorUserId, schoolId);
    return new SchoolLobbyQuery(this.db).listBySchool(schoolId, options);
  }
}
