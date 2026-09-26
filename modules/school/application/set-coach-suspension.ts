import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  resumeCoachSchoolMembership,
  suspendCoachSchoolMembership,
} from "../domain/coach-school-membership";
import { SchoolError } from "../domain/errors";
import { AuditAction, AuditEntityType, AuditService } from "../infrastructure/audit-service";
import { CoachSchoolMembershipRepository } from "../infrastructure/coach-school-membership-repository";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const setCoachSuspensionSchema = z.strictObject({
  suspended: z.boolean(),
  reason: z.string().trim().min(1).max(500).nullish().transform((value) => value ?? null),
});

/**
 * Deactivates or reactivates a coach inside one school.
 *
 * Deliberately not a MembershipStatus transition: ENDED/REVOKED mean the coach
 * left, and the code that produces them also ends every athlete assignment and
 * cancels future prescriptions. Suspension must keep athletes, links and history
 * intact while refusing only new assignments, and it has to be reversible.
 */
export class SetCoachSuspension {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string, raw: unknown) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    if (!idSchema.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    if (!idSchema.safeParse(membershipId).success) throw this.notFound();
    const input = setCoachSuspensionSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const school = await tx.school.findUnique({
          where: { id: schoolId }, select: { id: true, status: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        await new CanManageMembers(new SchoolMembershipRepository(tx)).assert(actor.data, school.id);
        if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);

        const memberships = new CoachSchoolMembershipRepository(tx);
        const current = await memberships.findById(membershipId);
        // A link from another school must not be reachable through this school's URL.
        if (!current || current.schoolId !== school.id) throw this.notFound();

        const now = this.clock();
        const next = input.suspended
          ? suspendCoachSchoolMembership(current, actor.data, now)
          : resumeCoachSchoolMembership(current, now);
        const saved = await memberships.saveSuspension(next, current.updatedAt);
        if (!saved) throw this.conflict();

        await new AuditService(tx).log({
          schoolId: school.id,
          actorUserId: actor.data,
          action: input.suspended ? AuditAction.COACH_SUSPENDED : AuditAction.COACH_RESUMED,
          entityType: AuditEntityType.COACH_MEMBERSHIP,
          entityId: saved.id,
          metadata: {
            coachId: saved.coachId,
            reason: input.reason,
            previousSuspendedAt: current.suspendedAt?.toISOString() ?? null,
            suspendedAt: saved.suspendedAt?.toISOString() ?? null,
          },
        });
        return saved;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw this.conflict();
      }
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", "Vínculo do professor não encontrado.", 404);
  }

  private conflict() {
    return new SchoolError(
      "COACH_SCHOOL_MEMBERSHIP_CONFLICT",
      "O vínculo do professor foi alterado. Atualize e tente novamente.",
      409,
    );
  }
}
