import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

export class RejectAthleteMembership {
  private readonly memberships: SchoolAthleteMembershipRepository;

  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {
    this.memberships = new SchoolAthleteMembershipRepository(db);
  }

  async execute(actorUserId: string | null, schoolId: string, membershipId: string) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const schoolTarget = idSchema.safeParse(schoolId);
    if (!schoolTarget.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const membershipTarget = idSchema.safeParse(membershipId);
    if (!membershipTarget.success) throw this.notFound();

    const school = await this.db.school.findUnique({
      where: { id: schoolTarget.data }, select: { id: true, ownerUserId: true },
    });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    // School-level delegated administration is added with the membership policy.
    if (school.ownerUserId !== actor.data) {
      throw new SchoolError("FORBIDDEN", "Você não pode alterar esta escola.", 403);
    }
    const membership = await this.memberships.findById(membershipTarget.data);
    if (!membership || membership.schoolId !== school.id) throw this.notFound();

    try {
      // The repository enforces PENDING -> REJECTED and protects concurrent updates.
      const rejected = await this.memberships.updateStatus(membership.id, "REJECTED", this.clock(), actor.data);
      if (!rejected) throw this.notFound();
      return rejected;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", "O vínculo do atleta foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", "Vínculo do atleta não encontrado.", 404);
  }
}
