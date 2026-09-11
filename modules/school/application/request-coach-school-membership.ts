import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { createCoachSchoolMembership } from "../domain/coach-school-membership";
import { CoachSchoolMembershipRepository } from "../infrastructure/coach-school-membership-repository";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

export class RequestCoachSchoolMembership {
  private readonly memberships: CoachSchoolMembershipRepository;

  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {
    this.memberships = new CoachSchoolMembershipRepository(db);
  }

  async execute(actorUserId: string | null, schoolId: string) {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const target = id.safeParse(schoolId);
    if (!target.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const userId = actor.data;
    const targetSchoolId = target.data;
    const [coach, school] = await Promise.all([
      this.db.coachProfile.findUnique({ where: { userId } }),
      this.db.school.findUnique({ where: { id: targetSchoolId }, select: { id: true, status: true } }),
    ]);
    if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Perfil de professor não encontrado.", 404);
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
    const active = await this.memberships.findActiveBySchoolAndCoach(school.id, coach.id);
    if (active) throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_ALREADY_ACTIVE", "Você já possui vínculo ativo com esta escola.", 409);
    return this.memberships.create(createCoachSchoolMembership({ id: randomUUID(), coachId: coach.id, schoolId: school.id }, this.clock()));
  }
}
