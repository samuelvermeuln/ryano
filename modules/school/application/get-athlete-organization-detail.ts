import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { findLastAccess } from "../infrastructure/last-access";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
const HISTORY_LIMIT = 50;

/**
 * Athlete as shown in the organograma drawer: identity, contact, the coach
 * currently responsible, and the succession of coaches before them.
 *
 * The history is derived from the assignment periods themselves rather than a
 * separate log, because a transfer already closes one period and opens another;
 * a parallel audit table would be a second source of truth that could disagree.
 *
 * The CPF is never read, matching GetSchoolMemberDetail and GetCoachDetail.
 *
 * Age is absent on purpose: no birth date is stored anywhere in the schema, and
 * inventing a column here would create a personal-data field with no collection
 * point, no consent and no way to keep it correct.
 */
export class GetAthleteOrganizationDetail {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, athleteId: string) {
    if (!idSchema.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!idSchema.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    if (!idSchema.safeParse(athleteId).success) throw this.notFound();

    const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);

    const memberships = new SchoolMembershipRepository(this.db);
    if (!await memberships.findActiveBySchoolAndUser(school.id, actorUserId as string)) {
      throw new SchoolError("FORBIDDEN", "Você não participa desta escola.", 403);
    }
    const canManage = await new CanManageMembers(memberships).execute(actorUserId, school.id);

    const membership = await this.db.schoolAthleteMembership.findFirst({
      where: { schoolId: school.id, athleteId, status: "ACTIVE" },
      select: { id: true, status: true, startedAt: true, joinSource: true },
    });
    // Scoped to this school: an athlete of another school is simply not found here.
    if (!membership) throw this.notFound();

    const athlete = await this.db.user.findUnique({
      where: { id: athleteId },
      select: {
        id: true, name: true, email: true, image: true, status: true,
        profile: { select: { phoneE164: true } },
      },
    });
    if (!athlete) throw this.notFound();

    const [periods, lastAccess, licenses] = await Promise.all([
      this.db.coachAthleteAssignment.findMany({
        where: { schoolId: school.id, athleteId },
        select: {
          id: true, coachId: true, status: true, isPrimary: true, sportType: true,
          startedAt: true, endedAt: true, assignedBy: true, endedBy: true, reason: true,
          coach: { select: { id: true, displayName: true, userId: true } },
        },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        take: HISTORY_LIMIT,
      }),
      findLastAccess(this.db, athleteId, this.clock()),
      this.db.trainingLicense.findMany({
        where: { athleteId, status: "ACTIVE" },
        select: { id: true, status: true, startedAt: true, expiresAt: true },
        orderBy: { id: "asc" },
        take: 20,
      }),
    ]);

    const actorIds = [...new Set(periods.flatMap((p) => [p.assignedBy, p.endedBy]).filter((v): v is string => !!v))];
    const actors = actorIds.length > 0
      ? await this.db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const actorNames = new Map(actors.map((a) => [a.id, a.name]));

    const current = periods.find((period) => period.status === "ACTIVE" && period.isPrimary) ?? null;

    return {
      athlete: {
        id: athlete.id, name: athlete.name, email: athlete.email, image: athlete.image,
        status: athlete.status,
        phoneE164: athlete.profile?.phoneE164 ?? null,
      },
      membership,
      currentCoach: current
        ? { coachId: current.coachId, displayName: current.coach.displayName, sportType: current.sportType }
        : null,
      history: periods.map((period) => ({
        id: period.id,
        coachId: period.coachId,
        coachName: period.coach.displayName,
        status: period.status,
        sportType: period.sportType,
        startedAt: period.startedAt,
        endedAt: period.endedAt,
        reason: period.reason,
        assignedByName: period.assignedBy ? actorNames.get(period.assignedBy) ?? null : null,
        endedByName: period.endedBy ? actorNames.get(period.endedBy) ?? null : null,
      })),
      activeLicenses: licenses,
      lastAccess,
      canManage,
    };
  }

  private notFound() {
    return new SchoolError("ATHLETE_NOT_FOUND", "Atleta não encontrado nesta escola.", 404);
  }
}
