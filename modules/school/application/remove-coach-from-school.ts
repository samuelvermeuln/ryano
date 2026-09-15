import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { CoachSchoolMembershipRepository } from "../infrastructure/coach-school-membership-repository";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

export class RemoveCoachFromSchool {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const schoolTarget = idSchema.safeParse(schoolId);
    if (!schoolTarget.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const membershipTarget = idSchema.safeParse(membershipId);
    if (!membershipTarget.success) throw this.notFound();

    try {
      return await this.db.$transaction(async (tx) => {
        const memberships = new CoachSchoolMembershipRepository(tx);
        const school = await tx.school.findUnique({
          where: { id: schoolTarget.data }, select: { id: true, ownerUserId: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        // School-level delegated administration is added with the membership policy.
        if (school.ownerUserId !== actor.data) {
          throw new SchoolError("FORBIDDEN", "Você não pode alterar esta escola.", 403);
        }
        const membership = await memberships.findById(membershipTarget.data);
        if (!membership || membership.schoolId !== school.id) throw this.notFound();

        const now = this.clock();
        const ended = await memberships.updateStatus(membership.id, "ENDED", now);
        if (!ended) throw this.notFound();
        const scope = { coachId: membership.coachId, schoolId: school.id, status: "ACTIVE" as const };
        const latest = await tx.coachAthleteAssignment.findFirst({ where: scope, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
        if (latest) z.date().min(latest.updatedAt).parse(now);
        // The serializable transaction also coordinates concurrent assignment creation.
        await tx.coachAthleteAssignment.updateMany({
          where: scope,
          data: { status: "ENDED", endedAt: now, endedBy: actor.data, updatedAt: now },
        });
        return ended;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_CONFLICT", "O vínculo do professor foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", "Vínculo do professor não encontrado.", 404);
  }
}
