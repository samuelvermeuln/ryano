/**
 * SAM-16 — the coach's weekly agenda for one school: every prescription of the
 * athletes this coach may read, positioned by the school's wall clock.
 *
 * SAM-36 — the same agenda for the independent coach (scope
 * `{ kind: "independent" }`, athletes with an ACTIVE independent link, the
 * coach's own zone), and in both scopes a calendar of planned AND done: each
 * prescription carries its prescribed × executed outcome, imported activities
 * nobody matched and sessions the athlete logged by hand are items of their
 * own, and the window may span several weeks (month view).
 *
 * Authorization is resolved once, in bulk, instead of one
 * `CanReadAthleteCurrentData` call per athlete: the same two rules it applies
 * — the school's OWNER/ADMIN reads every active athlete, any other coach reads
 * only the athletes assigned to them — are expressed as one athlete-id set
 * that the queries are scoped by. `schoolId` comes from the URL and is never
 * trusted: the actor must be an ACTIVE coach with an ACTIVE membership in
 * *this* school, so a coach of school A asking for school B's agenda gets
 * nothing, not a partial view.
 *
 * The week is a local calendar week (Monday–Sunday) in the agenda's zone,
 * converted to one UTC window for the query; grouping into slots happens in
 * `buildWeeklyAgenda`, after the zone conversion.
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { addCalendarDays, isValidLocalDate, localMidnightToUtc, type LocalDate } from "../domain/local-date";
import { derivePrescriptionOutcome, PrescriptionOutcome } from "../domain/prescription-outcome";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import type { AgendaItem, AgendaItemKind } from "../presentation/weekly-agenda";
import { resolveAthleteTimeZone } from "./athlete-time-zone";
import { MATCHED_EXECUTION_STATUSES } from "./athlete-training-scope";
import { CanManageSchool } from "./can-manage-school";
import { prescriptionScope, toCoachAthleteScope, type CoachAthleteScope, type CoachAthleteScopeInput } from "./coach-athlete-scope";
import { splitLinkedActivities } from "./unplanned-activities";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const AGENDA_ITEM_KINDS = ["prescription", "unplanned-import", "unplanned-self"] as const;

export const weeklyAgendaFiltersSchema = z.strictObject({
  /** Monday, "YYYY-MM-DD", in the agenda's zone. */
  weekStart: z.string().refine(isValidLocalDate, "Semana inválida."),
  /** SAM-36 — weeks from `weekStart` (the month view reads up to 6). */
  weeks: z.number().int().min(1).max(6).default(1),
  teamId: opaqueId.optional(),
  athleteId: opaqueId.optional(),
  sportType: z.string().trim().min(1).max(100).optional(),
  /** Only prescriptions with no responsible coach (system/marketplace-created). */
  withoutCoach: z.boolean().optional(),
  /** SAM-36 — which item kinds to include; default: all. */
  kinds: z.array(z.enum(AGENDA_ITEM_KINDS)).min(1).optional(),
});

export type WeeklyAgendaFilters = z.infer<typeof weeklyAgendaFiltersSchema>;

export type WeeklyAgendaResult = {
  scope: CoachAthleteScope;
  /** Null for the independent coach. */
  schoolId: string | null;
  schoolName: string | null;
  timeZone: string;
  weekStart: LocalDate;
  /** Exclusive: Monday after the last week read. */
  weekEnd: LocalDate;
  weeks: number;
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

type ReadableSet = {
  schoolId: string | null;
  schoolName: string | null;
  timeZone: string;
  coachId: string;
  seesWholeSchool: boolean;
  athletes: { id: string; name: string }[];
};

export class GetCoachWeeklyAgenda {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, scopeInput: CoachAthleteScopeInput, rawFilters: unknown): Promise<WeeklyAgendaResult> {
    if (!opaqueId.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    const scope = toCoachAthleteScope(scopeInput);
    if (scope.kind === "school" && !opaqueId.safeParse(scope.schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    const filters = weeklyAgendaFiltersSchema.parse(rawFilters);
    const kinds = new Set<AgendaItemKind>(filters.kinds ?? AGENDA_ITEM_KINDS);

    const readable = scope.kind === "school"
      ? await this.resolveSchool(actorUserId!, scope.schoolId)
      : await this.resolveIndependent(actorUserId!);
    const readableIds = readable.athletes.map((athlete) => athlete.id);
    const nameOf = new Map(readable.athletes.map((athlete) => [athlete.id, athlete.name]));
    const selectedIds = filters.athleteId
      ? [filters.athleteId].filter((id) => readableIds.includes(id))
      : readableIds;

    const weekEnd = addCalendarDays(filters.weekStart, 7 * filters.weeks);
    const windowStart = localMidnightToUtc(filters.weekStart, readable.timeZone);
    const windowEnd = localMidnightToUtc(weekEnd, readable.timeZone);
    const window = { gte: windowStart, lt: windowEnd };
    const scoped = prescriptionScope({ schoolId: readable.schoolId, coachId: readable.coachId });
    // Team and "no coach" filters are about prescriptions only.
    const wantsUnplanned = (kinds.has("unplanned-import") || kinds.has("unplanned-self")) && !filters.teamId && !filters.withoutCoach;

    const [rows, teams, executions, activities] = await Promise.all([
      readableIds.length === 0 || !kinds.has("prescription") ? [] : this.db.workoutAssignment.findMany({
        where: {
          ...scoped,
          athleteId: { in: selectedIds },
          scheduledAt: window,
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
          // SAM-36 — the execution that fulfilled it, to derive prescribed × executed.
          executions: {
            where: { matchStatus: { in: MATCHED_EXECUTION_STATUSES } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { sportType: true, durationSeconds: true, distanceMeters: true, activityId: true },
          },
        },
        orderBy: { scheduledAt: "asc" },
      }),
      readable.schoolId === null ? [] : this.db.team.findMany({
        where: { schoolId: readable.schoolId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // Every matched execution of the readable athletes in the window — whatever
      // scope it belongs to — decides which activities are unplanned; the ones on
      // UNPLANNED assignments are the self-logged sessions.
      !wantsUnplanned || selectedIds.length === 0 ? [] : this.db.workoutExecution.findMany({
        where: {
          athleteId: { in: selectedIds },
          matchStatus: { in: MATCHED_EXECUTION_STATUSES },
          startedAt: window,
          ...(filters.sportType ? { sportType: filters.sportType } : {}),
        },
        select: {
          id: true, athleteId: true, activityId: true, source: true, externalId: true, sportType: true,
          startedAt: true, durationSeconds: true, distanceMeters: true,
          assignment: { select: { id: true, status: true, workout: { select: { title: true } } } },
        },
      }),
      !wantsUnplanned || selectedIds.length === 0 || !kinds.has("unplanned-import") ? [] : this.db.activity.findMany({
        where: {
          userId: { in: selectedIds },
          startedAt: window,
          // SAM-48 (AC13) — a session mirrored by a second connection shows once.
          duplicateOfActivityId: null, parentActivityId: null,
          ...(filters.sportType ? { sportType: filters.sportType } : {}),
        },
        select: {
          id: true, userId: true, name: true, provider: true, externalId: true, sportType: true,
          startedAt: true, durationSeconds: true, movingSeconds: true, distanceMeters: true,
        },
        orderBy: { startedAt: "asc" },
      }),
    ]);

    const prescriptions: AgendaItem[] = rows.flatMap((row) => {
      if (!row.scheduledAt) return [];
      const execution = row.executions?.[0] ?? null;
      const sportType = row.workout?.sportType ?? row.workoutTemplate?.sportType ?? null;
      return [{
        kind: "prescription" as const,
        assignmentId: row.id,
        activityId: execution?.activityId ?? null,
        athlete: { id: row.athleteId, name: personName(row.athlete) },
        title: row.workout?.title ?? row.workoutTemplate?.title ?? row.sourceLabel ?? "Treino agendado",
        sportType,
        team: row.teamId && row.team ? { id: row.teamId, name: row.team.name } : null,
        coach: row.coachId && row.coach
          ? { id: row.coachId, name: row.coach.displayName ?? row.coach.user?.name ?? "Professor" }
          : null,
        status: row.status,
        outcome: derivePrescriptionOutcome({
          assignmentStatus: row.status,
          workoutSportType: sportType,
          matchedExecution: execution ? { sportType: execution.sportType } : null,
        }),
        scheduledAt: row.scheduledAt,
        dueAt: row.dueAt,
        durationSeconds: execution?.durationSeconds ?? null,
        distanceMeters: execution?.distanceMeters ?? null,
        // Same rule `RescheduleWorkout` enforces; the UI only decides whether to offer the button.
        canReschedule: row.coachId === readable.coachId,
      }];
    });

    const selfLogged: AgendaItem[] = kinds.has("unplanned-self")
      ? executions
        .filter((execution) => execution.assignment.status === WorkoutAssignmentStatus.UNPLANNED)
        .map((execution) => ({
          kind: "unplanned-self" as const,
          assignmentId: execution.assignment.id,
          activityId: execution.activityId,
          athlete: { id: execution.athleteId, name: nameOf.get(execution.athleteId) ?? "Atleta" },
          title: execution.assignment.workout?.title ?? "Atividade registrada",
          sportType: execution.sportType,
          team: null,
          coach: null,
          status: WorkoutAssignmentStatus.UNPLANNED,
          outcome: PrescriptionOutcome.UNPLANNED_ACTIVITY,
          scheduledAt: execution.startedAt,
          dueAt: null,
          durationSeconds: execution.durationSeconds,
          distanceMeters: execution.distanceMeters,
          canReschedule: false,
        }))
      : [];

    const imported: AgendaItem[] = kinds.has("unplanned-import")
      ? splitLinkedActivities(executions, activities).unlinked.map((activity) => ({
        kind: "unplanned-import" as const,
        assignmentId: null,
        activityId: activity.id,
        athlete: { id: activity.userId, name: nameOf.get(activity.userId) ?? "Atleta" },
        title: activity.name ?? "Atividade importada",
        sportType: activity.sportType,
        team: null,
        coach: null,
        status: WorkoutAssignmentStatus.UNPLANNED,
        outcome: PrescriptionOutcome.UNPLANNED_ACTIVITY,
        scheduledAt: activity.startedAt,
        dueAt: null,
        durationSeconds: activity.movingSeconds ?? activity.durationSeconds,
        distanceMeters: activity.distanceMeters,
        canReschedule: false,
      }))
      : [];

    const items = [...prescriptions, ...selfLogged, ...imported]
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    const sportTypes = [...new Set(items.map((item) => item.sportType).filter((s): s is string => Boolean(s)))]
      .sort();

    return {
      scope,
      schoolId: readable.schoolId,
      schoolName: readable.schoolName,
      timeZone: readable.timeZone,
      weekStart: filters.weekStart,
      weekEnd,
      weeks: filters.weeks,
      coachId: readable.coachId,
      seesWholeSchool: readable.seesWholeSchool,
      items,
      athletes: readable.athletes,
      teams,
      sportTypes,
    };
  }

  private async resolveCoach(actorUserId: string): Promise<{ id: string }> {
    const coach = await this.db.coachProfile.findUnique({
      where: { userId: actorUserId },
      select: { id: true, status: true },
    });
    if (!coach || coach.status !== "ACTIVE") {
      throw new SchoolError("FORBIDDEN", "Você não atua como professor nesta escola.", 403);
    }
    return { id: coach.id };
  }

  private async resolveSchool(actorUserId: string, schoolId: string): Promise<ReadableSet> {
    const school = await this.db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, status: true, timezone: true },
    });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    if (school.status !== "ACTIVE") throw new SchoolError("SCHOOL_INACTIVE", "A escola não está ativa.", 409);

    const now = this.clock();
    const coach = await this.resolveCoach(actorUserId);
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

    return { schoolId: school.id, schoolName: school.name, timeZone: school.timezone, coachId: coach.id, seesWholeSchool, athletes };
  }

  /** SAM-36 — outside a school: the coach's independent athletes, in the coach's own zone. */
  private async resolveIndependent(actorUserId: string): Promise<ReadableSet> {
    const now = this.clock();
    const coach = await this.resolveCoach(actorUserId);
    const [links, timeZone] = await Promise.all([
      this.db.coachAthleteAssignment.findMany({
        where: { coachId: coach.id, schoolId: null, status: "ACTIVE", endedAt: null, startedAt: { lte: now } },
        select: { athlete: { select: { id: true, name: true, email: true } } },
      }),
      resolveAthleteTimeZone(this.db, actorUserId),
    ]);
    const athletes = links
      .map((row) => ({ id: row.athlete.id, name: personName(row.athlete) }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return { schoolId: null, schoolName: null, timeZone, coachId: coach.id, seesWholeSchool: false, athletes };
  }
}
