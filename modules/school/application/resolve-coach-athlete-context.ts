/**
 * The authorization gate every coach-facing athlete screen goes through.
 *
 * `schoolId` and `athleteId` come from the URL, so they are navigation context
 * and never proof of anything. This resolves, server-side:
 *   1. the actor really has an ACTIVE `CoachProfile`;
 *   2. that coach has an ACTIVE membership in *this* school;
 *   3. the athlete has an ACTIVE membership in *this* school;
 *   4. the actor is authorized to read this athlete's current data, delegated to
 *      `CanReadAthleteCurrentData` (which accepts either the school's
 *      OWNER/ADMIN or the assigned coach) rather than re-implemented here.
 *
 * Authorization and lookup failures both surface as `ATHLETE_NOT_FOUND`, so
 * editing the ids in the URL cannot be used to discover which athletes belong
 * to which school.
 *
 * It also returns `periodStart`: prescriptions created before the athlete's
 * current membership period belong to a previous stay and need the athlete's
 * own consent to read (ADR-005). Callers scope their queries by it and report
 * what was held back instead of silently showing a shorter history.
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { CanReadAthleteCurrentData } from "./can-read-athlete-current-data";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);

export type CoachAthleteContext = {
  coachId: string;
  schoolId: string;
  schoolName: string;
  athlete: { id: string; name: string | null; email: string | null; image: string | null };
  /** Start of the athlete's current membership period in this school. */
  periodStart: Date;
  /** The primary coach currently responsible, which may not be the actor. */
  currentCoach: { coachId: string; name: string } | null;
  teams: string[];
  /** True when the actor is the coach responsible for this athlete, as opposed to an administrator. */
  isResponsibleCoach: boolean;
};

export function athleteNotFound(): SchoolError {
  return new SchoolError("ATHLETE_NOT_FOUND", "Atleta não encontrado nesta escola.", 404);
}

export class ResolveCoachAthleteContext {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, athleteId: string): Promise<CoachAthleteContext> {
    if (!opaqueId.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!opaqueId.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    if (!opaqueId.safeParse(athleteId).success) throw athleteNotFound();

    const school = await this.db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, status: true },
    });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    if (school.status !== "ACTIVE") {
      throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);
    }

    const now = this.clock();
    const coach = await this.db.coachProfile.findUnique({
      where: { userId: actorUserId! },
      select: { id: true, status: true },
    });
    if (!coach || coach.status !== "ACTIVE") throw athleteNotFound();

    const coachMembership = await this.db.coachSchoolMembership.findFirst({
      where: { schoolId: school.id, coachId: coach.id, status: "ACTIVE", endedAt: null },
      select: { id: true },
    });
    if (!coachMembership) throw athleteNotFound();

    const athleteMembership = await this.db.schoolAthleteMembership.findFirst({
      where: { schoolId: school.id, athleteId, status: "ACTIVE", endedAt: null },
      select: { startedAt: true, createdAt: true },
    });
    if (!athleteMembership) throw athleteNotFound();

    // The single source of truth for "may this actor read this athlete's current
    // data"; a coach with no assignment to this athlete stops here.
    const allowed = await new CanReadAthleteCurrentData(this.db, this.clock)
      .execute(actorUserId, { athleteId, schoolId: school.id });
    if (!allowed) throw athleteNotFound();

    const [athlete, primaryAssignment, actorAssignment, teams] = await Promise.all([
      this.db.user.findUnique({
        where: { id: athleteId },
        select: { id: true, name: true, email: true, image: true },
      }),
      this.db.coachAthleteAssignment.findFirst({
        where: { schoolId: school.id, athleteId, status: "ACTIVE", isPrimary: true, endedAt: null },
        select: {
          coachId: true,
          coach: { select: { displayName: true, user: { select: { name: true } } } },
        },
      }),
      this.db.coachAthleteAssignment.findFirst({
        where: {
          schoolId: school.id, athleteId, coachId: coach.id,
          status: "ACTIVE", endedAt: null, startedAt: { lte: now },
        },
        select: { id: true },
      }),
      this.db.teamAthlete.findMany({
        where: { athleteId, team: { schoolId: school.id, archivedAt: null } },
        select: { team: { select: { name: true } } },
      }),
    ]);
    if (!athlete) throw athleteNotFound();

    return {
      coachId: coach.id,
      schoolId: school.id,
      schoolName: school.name,
      athlete,
      periodStart: athleteMembership.startedAt ?? athleteMembership.createdAt,
      currentCoach: primaryAssignment
        ? {
          coachId: primaryAssignment.coachId,
          name: primaryAssignment.coach.displayName ?? primaryAssignment.coach.user?.name ?? "Professor",
        }
        : null,
      teams: teams.map((entry) => entry.team.name),
      isResponsibleCoach: actorAssignment !== null,
    };
  }
}
