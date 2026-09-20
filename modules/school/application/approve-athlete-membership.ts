import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolAthleteMembershipRepository } from "../infrastructure/school-athlete-membership-repository";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { schoolLogger } from "../infrastructure/logger";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

export class ApproveAthleteMembership {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string) {
    const log = schoolLogger("approve-athlete-membership");
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const schoolTarget = idSchema.safeParse(schoolId);
    if (!schoolTarget.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const membershipTarget = idSchema.safeParse(membershipId);
    if (!membershipTarget.success) throw this.notFound();

    log.info("membership_approve_start", { actorUserId, schoolId, membershipId, correlationId: log.correlationId });

    try {
      const result = await this.db.$transaction(async (tx) => {
        const school = await tx.school.findUnique({
          where: { id: schoolTarget.data }, select: { id: true, status: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        await new CanManageMembers(new SchoolMembershipRepository(tx)).assert(actor.data, school.id);
        if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);

        const memberships = new SchoolAthleteMembershipRepository(tx);
        const membership = await memberships.findById(membershipTarget.data);
        if (!membership || membership.schoolId !== school.id) throw this.notFound();
        const approved = await memberships.updateStatus(membership.id, "ACTIVE", this.clock(), actor.data);
        if (!approved) throw this.notFound();
        return approved;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      log.info("membership_approved", { membershipId: result.id, schoolId, correlationId: log.correlationId });
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError
        && ["P2002", "P2025", "P2034"].includes(error.code)) {
        log.warn("membership_approve_conflict", { membershipId, correlationId: log.correlationId });
        throw new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_CONFLICT", "O vínculo do atleta foi alterado. Atualize e tente novamente.", 409);
      }
      if (error instanceof SchoolError) log.warn("membership_approve_error", { code: error.code, correlationId: log.correlationId });
      else log.error("membership_approve_unexpected", { error: String(error), correlationId: log.correlationId });
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("SCHOOL_ATHLETE_MEMBERSHIP_NOT_FOUND", "Vínculo do atleta não encontrado.", 404);
  }
}
