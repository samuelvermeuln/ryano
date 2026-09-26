import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** Ceilings exist so one huge school cannot turn this into an unbounded read. */
export const ORGANIZATION_CHART_COACH_LIMIT = 200;
export const ORGANIZATION_CHART_ATHLETE_LIMIT = 2000;

export type OrganizationChartAthlete = {
  athleteId: string;
  assignmentId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  status: string;
  sportType: string | null;
  startedAt: Date | null;
};

export type OrganizationChartCoach = {
  membershipId: string;
  coachId: string;
  userId: string;
  displayName: string;
  image: string | null;
  /** Per-school state. A suspended coach is shown, but receives no new athletes. */
  active: boolean;
  suspendedAt: Date | null;
  startedAt: Date | null;
  sportTypes: string[];
  athletes: OrganizationChartAthlete[];
};

/**
 * Hierarchy behind the organograma: school, its coaches, and the athletes each
 * one currently follows.
 *
 * Reading is open to any active member of the school, while `canManage` says
 * whether the viewer may also suspend coaches or move athletes — that is what
 * lets the UI show the whole structure to a coach or assistant while keeping
 * drag-and-drop and the deactivate action out of their hands.
 *
 * Athletes with no coach are returned separately instead of being hidden: an
 * unassigned athlete is exactly what an administrator opens this screen to find.
 */
export class GetOrganizationChart {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string | null, schoolId: string) {
    if (!idSchema.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!idSchema.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }

    const school = await this.db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, slug: true, logoUrl: true, status: true },
    });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);

    const memberships = new SchoolMembershipRepository(this.db);
    const viewerMembership = await memberships.findActiveBySchoolAndUser(school.id, actorUserId as string);
    if (!viewerMembership) {
      throw new SchoolError("FORBIDDEN", "Você não participa desta escola.", 403);
    }
    const canManage = await new CanManageMembers(memberships).execute(actorUserId, school.id);

    const [coachMemberships, assignments, athleteMemberships] = await Promise.all([
      this.db.coachSchoolMembership.findMany({
        where: { schoolId: school.id, status: "ACTIVE" },
        select: {
          id: true, coachId: true, startedAt: true, suspendedAt: true,
          coach: {
            select: {
              id: true, userId: true, displayName: true,
              user: { select: { image: true } },
            },
          },
        },
        orderBy: { id: "asc" },
        take: ORGANIZATION_CHART_COACH_LIMIT,
      }),
      this.db.coachAthleteAssignment.findMany({
        where: { schoolId: school.id, status: "ACTIVE", isPrimary: true },
        select: {
          id: true, athleteId: true, coachId: true, sportType: true, startedAt: true,
          athlete: { select: { id: true, name: true, email: true, image: true, status: true } },
        },
        orderBy: { id: "asc" },
        take: ORGANIZATION_CHART_ATHLETE_LIMIT,
      }),
      this.db.schoolAthleteMembership.findMany({
        where: { schoolId: school.id, status: "ACTIVE" },
        select: {
          id: true, athleteId: true,
          athlete: { select: { id: true, name: true, email: true, image: true, status: true } },
        },
        orderBy: { id: "asc" },
        take: ORGANIZATION_CHART_ATHLETE_LIMIT,
      }),
    ]);

    const byCoach = new Map<string, OrganizationChartAthlete[]>();
    const assignedAthleteIds = new Set<string>();
    for (const assignment of assignments) {
      // An assignment may outlive the athlete's school membership; the chart
      // still shows it, because the link is what the administrator acts on.
      assignedAthleteIds.add(assignment.athleteId);
      const bucket = byCoach.get(assignment.coachId) ?? [];
      bucket.push({
        athleteId: assignment.athleteId,
        assignmentId: assignment.id,
        name: assignment.athlete.name,
        email: assignment.athlete.email,
        image: assignment.athlete.image,
        status: assignment.athlete.status,
        sportType: assignment.sportType,
        startedAt: assignment.startedAt,
      });
      byCoach.set(assignment.coachId, bucket);
    }

    const byName = (a: { name: string | null }, b: { name: string | null }) =>
      (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");

    const coaches: OrganizationChartCoach[] = coachMemberships.map((membership) => {
      const athletes = (byCoach.get(membership.coachId) ?? []).sort(byName);
      return {
        membershipId: membership.id,
        coachId: membership.coachId,
        userId: membership.coach.userId,
        displayName: membership.coach.displayName,
        image: membership.coach.user.image,
        active: membership.suspendedAt === null,
        suspendedAt: membership.suspendedAt,
        startedAt: membership.startedAt,
        sportTypes: [...new Set(athletes.map((a) => a.sportType).filter((s): s is string => s !== null))].sort(),
        athletes,
      };
    }).sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));

    const unassigned = athleteMemberships
      .filter((membership) => !assignedAthleteIds.has(membership.athleteId))
      .map((membership) => ({
        athleteId: membership.athleteId,
        membershipId: membership.id,
        name: membership.athlete.name,
        email: membership.athlete.email,
        image: membership.athlete.image,
        status: membership.athlete.status,
      }))
      .sort(byName);

    return {
      school: {
        id: school.id,
        name: school.name,
        slug: school.slug,
        logoUrl: school.logoUrl,
        status: school.status,
        coachCount: coaches.length,
        activeCoachCount: coaches.filter((coach) => coach.active).length,
        athleteCount: athleteMemberships.length,
        assignedAthleteCount: assignedAthleteIds.size,
      },
      coaches,
      unassigned,
      canManage,
      // Signals a clipped read so the UI can say so rather than quietly lie
      // about the size of the school.
      truncated: {
        coaches: coachMemberships.length === ORGANIZATION_CHART_COACH_LIMIT,
        athletes: assignments.length === ORGANIZATION_CHART_ATHLETE_LIMIT
          || athleteMemberships.length === ORGANIZATION_CHART_ATHLETE_LIMIT,
      },
    };
  }
}
