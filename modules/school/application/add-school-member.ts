import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { MembershipStatus, SchoolRole } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { createSchoolMembership, transitionSchoolMembership } from "../domain/school-membership";
import { createSchoolMembershipRole } from "../domain/school-membership-role";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
export const addSchoolMemberSchema = z.strictObject({
  userId: idSchema,
  roles: z.array(z.enum(SchoolRole)).min(1).max(Object.keys(SchoolRole).length)
    .refine((roles) => new Set(roles).size === roles.length, "Papéis duplicados."),
});

/** Administrative admission creates a new effective period, never reopens history. */
export class AddSchoolMember {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, raw: unknown) {
    const actor = idSchema.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const target = idSchema.safeParse(schoolId);
    if (!target.success) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    const input = addSchoolMemberSchema.parse(raw);

    try {
      return await this.db.$transaction(async (tx) => {
        const memberships = new SchoolMembershipRepository(tx);
        const school = await tx.school.findUnique({
          where: { id: target.data }, select: { id: true, status: true, ownerUserId: true },
        });
        if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
        await new CanManageMembers(memberships).assert(actor.data, school.id);
        if (school.status !== "ACTIVE") {
          throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
        }
        if (input.roles.includes(SchoolRole.OWNER) && school.ownerUserId !== actor.data) {
          throw new SchoolError("FORBIDDEN", "Somente o proprietário pode atribuir o papel OWNER.", 403);
        }
        const user = await tx.user.findUnique({ where: { id: input.userId }, select: { status: true } });
        if (!user) throw new SchoolError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
        if (user.status !== "ACTIVE") throw new SchoolError("FORBIDDEN", "Esta conta não pode ingressar na escola.", 403);
        const existing = await tx.schoolMembership.findFirst({
          where: { schoolId: school.id, userId: input.userId, status: { in: ["PENDING", "ACTIVE"] } },
          select: { id: true },
        });
        if (existing) {
          throw new SchoolError("SCHOOL_MEMBERSHIP_ALREADY_EXISTS", "Já existe um vínculo aberto com esta escola.", 409);
        }
        const now = this.clock();
        const membership = await memberships.create(transitionSchoolMembership(
          createSchoolMembership({ id: randomUUID(), schoolId: school.id, userId: input.userId }, now),
          MembershipStatus.ACTIVE,
          now,
        ));
        const roles = [];
        for (const role of input.roles) {
          roles.push(await memberships.addRole(createSchoolMembershipRole({
            id: randomUUID(), membershipId: membership.id, role,
          }, now)));
        }
        return { ...membership, roles };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        throw new SchoolError("SCHOOL_MEMBERSHIP_CONFLICT", "O vínculo foi alterado. Atualize e tente novamente.", 409);
      }
      throw error;
    }
  }
}
