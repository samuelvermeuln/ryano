import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { MembershipStatus, SchoolRole } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createSchoolMembershipRole } from "../domain/school-membership-role";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const addRoleToMemberSchema = z.strictObject({ role: z.enum(SchoolRole) });

/** Adds one permission to the current membership without replacing its other roles. */
export class AddRoleToMember {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string, raw: unknown) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const schoolTarget = idSchema.safeParse(schoolId);
    if (!schoolTarget.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const memberTarget = idSchema.safeParse(membershipId);
    if (!memberTarget.success) throw this.notFound();
    const input = addRoleToMemberSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const memberships = new SchoolMembershipRepository(tx);
        const school = await tx.school.findUnique({
          where: { id: schoolTarget.data }, select: { id: true, status: true, ownerUserId: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        await new CanManageMembers(memberships).assert(actor.data, school.id);
        if (school.status !== "ACTIVE") {
          throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
        }
        const membership = await memberships.findById(memberTarget.data);
        if (!membership || membership.schoolId !== school.id) throw this.notFound();
        if (membership.status !== MembershipStatus.ACTIVE || membership.endedAt !== null) {
          throw new SchoolError("SCHOOL_MEMBERSHIP_NOT_ACTIVE", "O vínculo escolar não está ativo.", 409);
        }
        if (school.ownerUserId !== actor.data
          && (membership.userId === school.ownerUserId || input.role === SchoolRole.OWNER)) {
          throw new SchoolError("FORBIDDEN", "Somente o proprietário pode gerenciar seus papéis ou atribuir OWNER.", 403);
        }
        const roles = await memberships.findRoles(membership.id);
        if (roles.some(({ role }) => role === input.role)) {
          throw new SchoolError("SCHOOL_MEMBERSHIP_ROLE_ALREADY_EXISTS", "O membro já possui este papel.", 409);
        }
        const now = z.date().min(membership.updatedAt).parse(this.clock());
        return memberships.addRole(createSchoolMembershipRole({
          id: randomUUID(), membershipId: membership.id, role: input.role,
        }, now));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025", "P2034"].includes(error.code)) {
        throw new SchoolError("SCHOOL_MEMBERSHIP_CONFLICT", "O vínculo foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }

  private notFound() {
    return new SchoolError("SCHOOL_MEMBERSHIP_NOT_FOUND", "Vínculo escolar não encontrado.", 404);
  }
}
