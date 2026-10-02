/**
 * SAM-37 — who may read an athlete's activities, resolved once for the three
 * readers: the coach inside a school, the independent coach (both through
 * `ResolveCoachAthleteContext`, SAM-30) and the school's administration
 * (OWNER/ADMIN through `CanManageMembers`, the same gate as the athlete sheet).
 *
 * The three answer the same questions — which prescriptions count as "this
 * scope", from which date the reader may look (`periodStart`), in which zone —
 * so the activity use cases take one context and never branch on who is
 * asking. Consent for earlier dates stays with `CanReadAthleteHistory`, which
 * already knows how to answer for an administrator or a coach.
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { resolveAthleteTimeZone } from "./athlete-time-zone";
import { CanManageMembers } from "./can-manage-members";
import { toCoachAthleteScope, type CoachAthleteScope, type CoachAthleteScopeInput } from "./coach-athlete-scope";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** The school's administration reading an athlete of that school. */
export type SchoolAdminScope = { kind: "school-admin"; schoolId: string };
/** SAM-41 — the athlete reading their own activities (`actorUserId === athleteId`). */
export type SelfScope = { kind: "self" };
export type ActivityReaderScopeInput = CoachAthleteScopeInput | SchoolAdminScope | SelfScope;

export type ActivityReaderContext = {
  reader: "coach" | "school-admin" | "athlete";
  /** Null for independent coaching. */
  schoolId: string | null;
  schoolName: string | null;
  /** The reading coach; null for the administration. */
  coachId: string | null;
  timeZone: string;
  athlete: { id: string; name: string | null; email: string | null; image: string | null };
  /** Start of the athlete's current membership (school) or link (independent). */
  periodStart: Date;
  currentCoach: { coachId: string; name: string } | null;
  teams: string[];
  isResponsibleCoach: boolean;
  /** Where this athlete's hub lives for the reader, for links the screens build. */
  scope: CoachAthleteScope | SchoolAdminScope | SelfScope;
};

/**
 * Is this prescription one the reader's scope owns? Mirrors `isInPrescriptionScope`
 * (ADR-009). The athlete owns every prescription made to them.
 */
export function isPrescriptionOfReader(
  row: { schoolId: string | null; coachId: string | null },
  context: Pick<ActivityReaderContext, "schoolId" | "coachId"> & { reader?: ActivityReaderContext["reader"] },
): boolean {
  if (context.reader === "athlete") return true;
  return context.schoolId !== null
    ? row.schoolId === context.schoolId
    : row.schoolId === null && row.coachId !== null && row.coachId === context.coachId;
}

export class ResolveActivityReaderContext {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, scope: ActivityReaderScopeInput, athleteId: string): Promise<ActivityReaderContext> {
    if (typeof scope === "object" && scope.kind === "school-admin") {
      return this.resolveSchoolAdmin(actorUserId, scope.schoolId, athleteId);
    }
    if (typeof scope === "object" && scope.kind === "self") {
      return this.resolveSelf(actorUserId, athleteId);
    }
    const context = await new ResolveCoachAthleteContext(this.db, this.clock).execute(actorUserId, scope, athleteId);
    return {
      reader: "coach",
      schoolId: context.schoolId,
      schoolName: context.schoolName,
      coachId: context.coachId,
      timeZone: context.timeZone,
      athlete: context.athlete,
      periodStart: context.periodStart,
      currentCoach: context.currentCoach,
      teams: context.teams,
      isResponsibleCoach: context.isResponsibleCoach,
      scope: toCoachAthleteScope(scope),
    };
  }

  /** SAM-41 — the athlete themselves: everything they did, from the beginning, in their own zone. */
  private async resolveSelf(actorUserId: string | null, athleteId: string): Promise<ActivityReaderContext> {
    if (!opaqueId.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (actorUserId !== athleteId) {
      throw new SchoolError("ATHLETE_NOT_FOUND", "Atleta não encontrado.", 404);
    }
    const [athlete, timeZone] = await Promise.all([
      this.db.user.findUnique({ where: { id: athleteId }, select: { id: true, name: true, email: true, image: true } }),
      resolveAthleteTimeZone(this.db, athleteId),
    ]);
    if (!athlete) throw new SchoolError("ATHLETE_NOT_FOUND", "Atleta não encontrado.", 404);
    return {
      reader: "athlete",
      schoolId: null,
      schoolName: null,
      coachId: null,
      timeZone,
      athlete,
      periodStart: new Date(0),
      currentCoach: null,
      teams: [],
      isResponsibleCoach: false,
      scope: { kind: "self" },
    };
  }

  private async resolveSchoolAdmin(actorUserId: string | null, schoolId: string, athleteId: string): Promise<ActivityReaderContext> {
    if (!opaqueId.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!opaqueId.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    const notFound = () => new SchoolError("ATHLETE_NOT_FOUND", "Atleta não encontrado nesta escola.", 404);
    if (!opaqueId.safeParse(athleteId).success) throw notFound();

    const school = await this.db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, status: true, timezone: true },
    });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    await new CanManageMembers(new SchoolMembershipRepository(this.db)).assert(actorUserId, school.id);

    const membership = await this.db.schoolAthleteMembership.findFirst({
      where: { schoolId: school.id, athleteId, status: "ACTIVE", endedAt: null },
      select: { startedAt: true, createdAt: true },
    });
    // Scoped, not looked up: an athlete of another school is simply not found here.
    if (!membership) throw notFound();

    const [athlete, primaryAssignment, teams] = await Promise.all([
      this.db.user.findUnique({ where: { id: athleteId }, select: { id: true, name: true, email: true, image: true } }),
      this.db.coachAthleteAssignment.findFirst({
        where: { schoolId: school.id, athleteId, status: "ACTIVE", isPrimary: true, endedAt: null },
        select: { coachId: true, coach: { select: { displayName: true, user: { select: { name: true } } } } },
      }),
      this.db.teamAthlete.findMany({
        where: { athleteId, team: { schoolId: school.id, archivedAt: null } },
        select: { team: { select: { name: true } } },
      }),
    ]);
    if (!athlete) throw notFound();

    return {
      reader: "school-admin",
      schoolId: school.id,
      schoolName: school.name,
      coachId: null,
      timeZone: school.timezone,
      athlete,
      periodStart: membership.startedAt ?? membership.createdAt,
      currentCoach: primaryAssignment
        ? { coachId: primaryAssignment.coachId, name: primaryAssignment.coach.displayName ?? primaryAssignment.coach.user?.name ?? "Professor" }
        : null,
      teams: teams.map((entry) => entry.team.name),
      isResponsibleCoach: false,
      scope: { kind: "school-admin", schoolId: school.id },
    };
  }
}
