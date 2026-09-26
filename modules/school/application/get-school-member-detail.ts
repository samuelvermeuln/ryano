import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

/**
 * Administrative read of a single member: the temporal period, its local roles
 * and the contact data the school needs to reach the person.
 *
 * Deliberately excludes `UserProfile.cpfEncrypted`/`cpfHash`: a school
 * administrator has no operational need for the document, and reading it here
 * would leak it into every page render and server log of this screen.
 */
export class GetSchoolMemberDetail {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string) {
    if (!idSchema.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!idSchema.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    if (!idSchema.safeParse(membershipId).success) throw this.notFound();

    const school = await this.db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, ownerUserId: true },
    });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);

    const memberships = new SchoolMembershipRepository(this.db);
    await new CanManageMembers(memberships).assert(actorUserId, school.id);

    const membership = await memberships.findById(membershipId);
    // A membership of another school must not be readable through this school's
    // URL, otherwise the detail page becomes a cross-school data leak.
    if (!membership || membership.schoolId !== school.id) throw this.notFound();

    const [user, roles, athleteMembership, coachProfile] = await Promise.all([
      this.db.user.findUnique({
        where: { id: membership.userId },
        select: {
          id: true, name: true, email: true, image: true, status: true, createdAt: true,
          profile: { select: { phoneE164: true } },
          address: {
            select: {
              postalCode: true, street: true, number: true, complement: true,
              district: true, city: true, state: true, country: true,
            },
          },
        },
      }),
      memberships.findRoles(membership.id),
      this.db.schoolAthleteMembership.findFirst({
        where: { schoolId: school.id, athleteId: membership.userId },
        select: { id: true, status: true, startedAt: true, endedAt: true },
        orderBy: { createdAt: "desc" },
      }),
      this.db.coachProfile.findUnique({
        where: { userId: membership.userId },
        select: { id: true, displayName: true, status: true },
      }),
    ]);
    if (!user) throw new SchoolError("USER_NOT_FOUND", "Usuário não encontrado.", 404);

    const coachMembership = coachProfile
      ? await this.db.coachSchoolMembership.findFirst({
        where: { schoolId: school.id, coachId: coachProfile.id },
        select: { id: true, status: true, startedAt: true, endedAt: true },
        orderBy: { requestedAt: "desc" },
      })
      : null;

    return {
      membership,
      roles,
      user: { ...user, phoneE164: user.profile?.phoneE164 ?? null },
      isOwner: membership.userId === school.ownerUserId,
      athleteMembership,
      coach: coachProfile ? { ...coachProfile, membership: coachMembership } : null,
    };
  }

  private notFound() {
    return new SchoolError("SCHOOL_MEMBERSHIP_NOT_FOUND", "Vínculo escolar não encontrado.", 404);
  }
}
