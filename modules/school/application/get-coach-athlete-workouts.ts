/**
 * The athlete's prescription list/calendar for the coach, filtered by the same
 * situations the school's administration sheet uses (`athlete-training-scope`),
 * so "atrasado" never means two different things in two screens.
 *
 * This is the heavy list; the summary screen reads only one page of it through
 * its own use case. Rows carry summary-level planned-vs-executed only — the
 * block structure belongs to the workout detail route.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import {
  assignmentFilterWhere,
  ATHLETE_TRAINING_DEFAULT_LIMIT,
  ATHLETE_TRAINING_FILTERS,
  ATHLETE_TRAINING_MAX_LIMIT,
  isAssignmentOverdue,
  MATCHED_EXECUTION_STATUSES,
  OPEN_CHANGE_REQUEST_STATUSES,
  startOfUtcDay,
} from "./athlete-training-scope";
import { prescriptionScope, type CoachAthleteScopeInput } from "./coach-athlete-scope";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";
import { plannedTotalsOfRows } from "../domain/workout-structure";

const querySchema = z.strictObject({
  filter: z.enum(ATHLETE_TRAINING_FILTERS).default("todos"),
  limit: z.coerce.number().int().min(1).max(ATHLETE_TRAINING_MAX_LIMIT).default(ATHLETE_TRAINING_DEFAULT_LIMIT),
  /** Canonical `RyvanoSportType`, or absent for every modality. */
  sportType: z.string().trim().min(1).max(100).optional(),
});

export class GetCoachAthleteWorkouts {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, scope: CoachAthleteScopeInput, athleteId: string, raw: unknown = {}) {
    const context = await new ResolveCoachAthleteContext(this.db, this.clock)
      .execute(actorUserId, scope, athleteId);
    const options = querySchema.parse(raw);

    const today = startOfUtcDay(this.clock());
    const inScope: Prisma.WorkoutAssignmentWhereInput = {
      ...prescriptionScope(context),
      athleteId,
      status: { not: WorkoutAssignmentStatus.UNPLANNED },
      createdAt: { gte: context.periodStart },
      ...(options.sportType ? { workout: { sportType: options.sportType } } : {}),
    };

    const [counts, sportRows, rows, heldBack] = await Promise.all([
      Promise.all(ATHLETE_TRAINING_FILTERS.map((filter) =>
        this.db.workoutAssignment.count({ where: { AND: [inScope, assignmentFilterWhere(filter, today)] } }),
      )),
      // Which modalities this athlete actually has, so the filter never offers
      // an option that yields an empty list.
      this.db.workoutAssignment.findMany({
        where: {
          ...prescriptionScope(context),
          athleteId,
          status: { not: WorkoutAssignmentStatus.UNPLANNED },
          createdAt: { gte: context.periodStart },
          workout: { isNot: null },
        },
        select: { workout: { select: { sportType: true } } },
        distinct: ["workoutId"],
        take: ATHLETE_TRAINING_MAX_LIMIT,
      }),
      this.db.workoutAssignment.findMany({
        where: { AND: [inScope, assignmentFilterWhere(options.filter, today)] },
        select: {
          id: true, scheduledAt: true, status: true, sourceLabel: true, coachId: true,
          coach: { select: { displayName: true, user: { select: { name: true } } } },
          team: { select: { name: true } },
          workout: {
            select: {
              title: true, sportType: true,
              blocks: { select: { blockType: true, durationS: true, distanceM: true, repetitions: true, restPayload: true } },
            },
          },
          executions: {
            where: { matchStatus: { in: MATCHED_EXECUTION_STATUSES } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              startedAt: true, durationSeconds: true, distanceMeters: true,
              averageHeartRate: true,
              compliance: { select: { overallScore: true } },
              feedback: { select: { rpe: true } },
            },
          },
          changeRequests: {
            where: { status: { in: OPEN_CHANGE_REQUEST_STATUSES } },
            select: { id: true },
            take: 1,
          },
        },
        // Upcoming reads soonest-first, everything else newest-first. Undated
        // rows (plan sessions not yet scheduled) always sink to the bottom.
        orderBy: [
          { scheduledAt: { sort: options.filter === "proximos" ? "asc" : "desc", nulls: "last" } },
          { id: "desc" },
        ],
        take: options.limit + 1,
      }),
      this.db.workoutAssignment.count({
        where: {
          ...prescriptionScope(context),
          athleteId,
          status: { not: WorkoutAssignmentStatus.UNPLANNED },
          createdAt: { lt: context.periodStart },
        },
      }),
    ]);

    const items = rows.slice(0, options.limit).map((row) => {
      const execution = row.executions[0] ?? null;
      const blocks = row.workout?.blocks ?? [];
      return {
        id: row.id,
        scheduledAt: row.scheduledAt,
        status: row.status,
        overdue: isAssignmentOverdue(row, today),
        title: row.workout?.title ?? row.sourceLabel ?? "Treino agendado",
        sportType: row.workout?.sportType ?? null,
        team: row.team?.name ?? null,
        coach: row.coachId
          ? { id: row.coachId, name: row.coach?.displayName ?? row.coach?.user?.name ?? "Professor" }
          : null,
        targetDurationSeconds: plannedTotalsOfRows(blocks).durationSeconds,
        targetDistanceMeters: plannedTotalsOfRows(blocks).distanceMeters,
        hasOpenChangeRequest: row.changeRequests.length > 0,
        execution: execution
          ? {
            startedAt: execution.startedAt,
            durationSeconds: execution.durationSeconds,
            distanceMeters: execution.distanceMeters,
            averageHeartRate: execution.averageHeartRate,
            complianceScore: execution.compliance?.overallScore ?? null,
            rpe: execution.feedback?.rpe ?? null,
          }
          : null,
      };
    });

    return {
      context,
      filter: options.filter,
      sportType: options.sportType ?? null,
      availableSportTypes: [...new Set(
        sportRows.map((row) => row.workout?.sportType).filter((sport): sport is string => Boolean(sport)),
      )].sort(),
      counts: Object.fromEntries(
        ATHLETE_TRAINING_FILTERS.map((filter, index) => [filter, counts[index]!]),
      ) as Record<(typeof ATHLETE_TRAINING_FILTERS)[number], number>,
      items,
      hasMore: rows.length > options.limit,
      limit: options.limit,
      heldBack,
    };
  }
}
