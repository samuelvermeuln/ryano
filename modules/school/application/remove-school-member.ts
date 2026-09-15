import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { MembershipStatus, SchoolRole } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** Ends the effective membership period, retaining its identity and historical roles. */
export class RemoveSchoolMember {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const target = idSchema.safeParse(schoolId);
    if (!target.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const memberTarget = idSchema.safeParse(membershipId);
    if (!memberTarget.success) throw this.notFound();

    try {
      return await this.db.$transaction(async (tx) => {
        const memberships = new SchoolMembershipRepository(tx);
        const school = await tx.school.findUnique({
          where: { id: target.data }, select: { id: true, ownerUserId: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        await new CanManageMembers(memberships).assert(actor.data, school.id);
        const membership = await memberships.findById(memberTarget.data);
        if (!membership || membership.schoolId !== school.id) throw this.notFound();
        if (membership.userId === school.ownerUserId) {
          throw new SchoolError("SCHOOL_OWNER_PROTECTED", "O proprietário da escola não pode ser removido.", 409);
        }
        const roles = await memberships.findRoles(membership.id);
        if (roles.some(({ role }) => role === SchoolRole.OWNER)) {
          if (school.ownerUserId !== actor.data) {
            throw new SchoolError("FORBIDDEN", "Somente o proprietário pode remover um membro OWNER.", 403);
          }
          const otherOwner = await tx.schoolMembership.findFirst({
            where: {
              schoolId: school.id, id: { not: membership.id }, status: MembershipStatus.ACTIVE,
              roles: { some: { role: SchoolRole.OWNER } },
            },
            select: { id: true },
          });
          if (!otherOwner) {
            throw new SchoolError("SCHOOL_LAST_OWNER", "A escola deve manter ao menos um OWNER ativo.", 409);
          }
        }
        const ended = await memberships.updateStatus(membership.id, MembershipStatus.ENDED, this.clock());
        if (!ended) throw this.notFound();
        return ended;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("SCHOOL_MEMBERSHIP_CONFLICT", "O vínculo foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("SCHOOL_MEMBERSHIP_NOT_FOUND", "Vínculo escolar não encontrado.", 404);
  }
}
