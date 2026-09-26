import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { findLastAccess } from "../infrastructure/last-access";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

/**
 * Administrative profile of one coach as seen from a single school: identity
 * and contact, the temporal link with this school, the athletes they currently
 * follow, and when the account was last seen.
 *
 * Everything is scoped to `schoolId` on purpose — a coach may work for several
 * schools, and this school's administrator has no business reading the others.
 * As in GetSchoolMemberDetail, the CPF is never read.
 */
export class GetCoachDetail {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string) {
    if (!idSchema.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!idSchema.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    if (!idSchema.safeParse(membershipId).success) throw this.notFound();

    const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    await new CanManageMembers(new SchoolMembershipRepository(this.db)).assert(actorUserId, school.id);

    const membership = await this.db.coachSchoolMembership.findUnique({
      where: { id: membershipId },
      select: {
        id: true, coachId: true, schoolId: true, status: true,
        requestedAt: true, decidedAt: true, startedAt: true, endedAt: true,
        suspendedAt: true, suspendedBy: true,
      },
    });
    // Reject a coach membership that belongs to another school, so this school's
    // URL cannot be used to read another school's staff.
    if (!membership || membership.schoolId !== school.id) throw this.notFound();

    const coach = await this.db.coachProfile.findUnique({
      where: { id: membership.coachId },
      select: {
        id: true, userId: true, displayName: true, bio: true, status: true, createdAt: true,
        user: {
          select: {
            id: true, name: true, email: true, image: true, status: true,
            profile: { select: { phoneE164: true } },
            address: {
              select: {
                postalCode: true, street: true, number: true, complement: true,
                district: true, city: true, state: true, country: true,
              },
            },
          },
        },
      },
    });
    if (!coach) throw new SchoolError("COACH_PROFILE_NOT_FOUND", "Professor não encontrado.", 404);

    const [athletes, lastAccess, schoolMembership] = await Promise.all([
      this.db.coachAthleteAssignment.findMany({
        where: { schoolId: school.id, coachId: coach.id, status: "ACTIVE" },
        select: {
          id: true, athleteId: true, isPrimary: true, sportType: true, startedAt: true,
          athlete: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { startedAt: "asc" },
      }),
      findLastAccess(this.db, coach.userId, this.clock()),
      this.db.schoolMembership.findFirst({
        where: { schoolId: school.id, userId: coach.userId, status: "ACTIVE" },
        select: { id: true, roles: { select: { role: true } } },
      }),
    ]);

    return {
      membership,
      coach: {
        id: coach.id, userId: coach.userId, displayName: coach.displayName,
        bio: coach.bio, status: coach.status, createdAt: coach.createdAt,
      },
      user: { ...coach.user, phoneE164: coach.user.profile?.phoneE164 ?? null },
      athletes,
      lastAccess,
      schoolMembership,
    };
  }

  private notFound() {
    return new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", "Vínculo do professor não encontrado.", 404);
  }
}
