import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createSchoolAthleteMembership } from "../domain/school-athlete-membership";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export class RequestSchoolMembership {
  private readonly memberships: SchoolAthleteMembershipRepository;

  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {
    this.memberships = new SchoolAthleteMembershipRepository(db);
  }

  async execute(actorUserId: string | null, schoolId: string) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const target = id.safeParse(schoolId);
    if (!target.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const school = await this.db.school.findUnique({ where: { id: target.data }, select: { id: true, status: true } });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
    const active = await this.memberships.findActiveBySchoolAndAthlete(school.id, actor.data);
    if (active) throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_ACTIVE", "Você já possui vínculo ativo com esta escola.", 409);
    return this.memberships.create(createSchoolAthleteMembership({ id: randomUUID(), athleteId: actor.data, schoolId: school.id, joinSource: "MANUAL_SEARCH" }, this.clock()));
  }
}
