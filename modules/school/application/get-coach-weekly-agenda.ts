/**
 * SAM-16 — the coach's weekly agenda for one school: every prescription of the
 * athletes this coach may read, positioned by the school's wall clock.
 *
 * Authorization is resolved once, in bulk, instead of one
 * `CanReadAthleteCurrentData` call per athlete: the same two rules it applies
 * — the school's OWNER/ADMIN reads every active athlete, any other coach reads
 * only the athletes assigned to them — are expressed as one athlete-id set
 * that the assignment query is scoped by. `schoolId` comes from the URL and is
 * never trusted: the actor must be an ACTIVE coach with an ACTIVE membership
 * in *this* school, so a coach of school A asking for school B's agenda gets
 * nothing, not a partial view.
 *
 * The week is a local calendar week (Monday–Sunday) in the school's zone,
 * converted to one UTC window for the query; grouping into slots happens in
 * `buildWeeklyAgenda`, after the zone conversion.
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { addCalendarDays, isValidLocalDate, localMidnightToUtc, type LocalDate } from "../domain/local-date";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import type { AgendaItem } from "../presentation/weekly-agenda";
import { CanManageSchool } from "./can-manage-school";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const weeklyAgendaFiltersSchema = z.strictObject({
  /** Monday, "YYYY-MM-DD", in the school's zone. */
  weekStart: z.string().refine(isValidLocalDate, "Semana inválida."),
  teamId: opaqueId.optional(),
  athleteId: opaqueId.optional(),
  sportType: z.string().trim().min(1).max(100).optional(),
  /** Only prescriptions with no responsible coach (system/marketplace-created). */
  withoutCoach: z.boolean().optional(),
});

export type WeeklyAgendaFilters = z.infer<typeof weeklyAgendaFiltersSchema>;

export type WeeklyAgendaResult = {
  schoolId: string;
  schoolName: string;
  timeZone: string;
  weekStart: LocalDate;
  /** Exclusive: Monday of the following week. */
  weekEnd: LocalDate;
  coachId: string;
  /** True for the school's OWNER/ADMIN, who sees the whole school. */
  seesWholeSchool: boolean;
  items: AgendaItem[];
  /** Filter options, limited to what the viewer may see. */
  athletes: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  sportTypes: string[];
};

function personName(person: { name: string | null; email: string | null }): string {
  return person.name ?? person.email ?? "Sem nome";
}

export class GetCoachWeeklyAgenda {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, rawFilters: unknown): Promise<WeeklyAgendaResult> {
    if (!opaqueId.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!opaqueId.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    const filters = weeklyAgendaFiltersSchema.parse(rawFilters);

    const school = await this.db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, status: true, timezone: true },
    });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);

    const now = this.clock();
    const coach = await this.db.coachProfile.findUnique({
      where: { userId: actorUserId! },
      select: { id: true, status: true },
    });
    if (!coach || coach.status !== "ACTIVE") {
      throw new SchoolError("FORBIDDEN", "Você não atua como professor nesta escola.", 403);
    }
    const coachMembership = await this.db.coachSchoolMembership.findFirst({
      where: { schoolId: school.id, coachId: coach.id, status: "ACTIVE", endedAt: null },
      select: { id: true },
    });
    if (!coachMembership) {
      throw new SchoolError("FORBIDDEN", "Você não atua como professor nesta escola.", 403);
    }

    const seesWholeSchool = await new CanManageSchool(new SchoolMembershipRepository(this.db))
      .execute(actorUserId, school.id);

    // The readable set: every athlete with an active stay in the school for an
    // administrator; only the assigned ones for any other coach. Both keep the
    // active-membership condition `CanReadAthleteCurrentData` applies.
    const readable = await this.db.schoolAthleteMembership.findMany({
      where: {
        schoolId: school.id, status: "ACTIVE", endedAt: null, startedAt: { lte: now },
        ...(seesWholeSchool ? {} : {
          athlete: { coachAssignments: { some: {
            schoolId: school.id, coachId: coach.id, status: "ACTIVE", endedAt: null, startedAt: { lte: now },
          } } },
        }),
      },
      select: { athlete: { select: { id: true, name: true, email: true } } },
    });
    const athletes = readable
      .map((row) => ({ id: row.athlete.id, name: personName(row.athlete) }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const readableIds = athletes.map((athlete) => athlete.id);

    const weekEnd = addCalendarDays(filters.weekStart, 7);
    const windowStart = localMidnightToUtc(filters.weekStart, school.timezone);
    const windowEnd = localMidnightToUtc(weekEnd, school.timezone);

    const [rows, teams] = await Promise.all([
      readableIds.length === 0 ? [] : this.db.workoutAssignment.findMany({
        where: {
          schoolId: school.id,
          athleteId: { in: filters.athleteId ? [filters.athleteId].filter((id) => readableIds.includes(id)) : readableIds },
          scheduledAt: { gte: windowStart, lt: windowEnd },
          ...(filters.teamId ? { teamId: filters.teamId } : {}),
          ...(filters.sportType ? { workout: { sportType: filters.sportType } } : {}),
          ...(filters.withoutCoach ? { coachId: null } : {}),
        },
        select: {
          id: true, athleteId: true, status: true, scheduledAt: true, dueAt: true, sourceLabel: true,
          coachId: true, teamId: true,
          workout: { select: { title: true, sportType: true } },
          workoutTemplate: { select: { title: true, sportType: true } },
          athlete: { select: { name: true, email: true } },
          team: { select: { name: true } },
          coach: { select: { displayName: true, user: { select: { name: true } } } },
        },
        orderBy: { scheduledAt: "asc" },
      }),
      this.db.team.findMany({
        where: { schoolId: school.id, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const items: AgendaItem[] = rows.flatMap((row) => {
      if (!row.scheduledAt) return [];
      return [{
        assignmentId: row.id,
        athlete: { id: row.athleteId, name: personName(row.athlete) },
        title: row.workout?.title ?? row.workoutTemplate?.title ?? row.sourceLabel ?? "Treino agendado",
        sportType: row.workout?.sportType ?? row.workoutTemplate?.sportType ?? null,
        team: row.teamId && row.team ? { id: row.teamId, name: row.team.name } : null,
        coach: row.coachId && row.coach
          ? { id: row.coachId, name: row.coach.displayName ?? row.coach.user?.name ?? "Professor" }
          : null,
        status: row.status,
        scheduledAt: row.scheduledAt,
        dueAt: row.dueAt,
        // Same rule `RescheduleWorkout` enforces; the UI only decides whether to offer the button.
        canReschedule: row.coachId === coach.id,
      }];
    });

    const sportTypes = [...new Set(items.map((item) => item.sportType).filter((s): s is string => Boolean(s)))]
      .sort();

    return {
      schoolId: school.id,
      schoolName: school.name,
      timeZone: school.timezone,
      weekStart: filters.weekStart,
      weekEnd,
      coachId: coach.id,
      seesWholeSchool,
      items,
      athletes,
      teams,
      sportTypes,
    };
  }
}
