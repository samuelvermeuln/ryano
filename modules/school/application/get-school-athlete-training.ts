import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import {
  assignmentFilterWhere,
  ATHLETE_TRAINING_DEFAULT_LIMIT,
  ATHLETE_TRAINING_FILTERS,
  ATHLETE_TRAINING_MAX_LIMIT,
  isAssignmentOverdue,
  MATCHED_EXECUTION_STATUSES,
  OPEN_CHANGE_REQUEST_STATUSES,
  startOfUtcDay,
  type AthleteTrainingFilter,
} from "./athlete-training-scope";
import { CanManageMembers } from "./can-manage-members";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

// Re-exported so the screens and tests that already import these from here keep
// working; the definitions live in athlete-training-scope, shared with the
// coach-facing athlete screens.
export {
  ATHLETE_TRAINING_DEFAULT_LIMIT,
  ATHLETE_TRAINING_FILTERS,
  ATHLETE_TRAINING_MAX_LIMIT,
  type AthleteTrainingFilter,
};

const querySchema = z.strictObject({
  filter: z.enum(ATHLETE_TRAINING_FILTERS).default("todos"),
  limit: z.coerce.number().int().min(1).max(ATHLETE_TRAINING_MAX_LIMIT).default(ATHLETE_TRAINING_DEFAULT_LIMIT),
});

/**
 * One athlete's whole training as the school's administration sees it: every
 * workout prescribed to them here (done, missed and still to come), with the
 * full block structure, what was actually executed, and the revision requests
 * opened against each prescription.
 *
 * What is deliberately left out, and why:
 * - Only prescriptions of *this* school (`schoolId`). Activities the athlete
 *   logged on their own are stored with `schoolId: null` and need a
 *   `HistoryAccessGrant` (ADR-005); they never reach this query. `UNPLANNED` is
 *   excluded as well so an off-plan row can never leak through a stray school id.
 * - Only prescriptions created inside the athlete's *current* membership period.
 *   Being linked today does not authorize reading a previous stay (ADR-005); the
 *   count of what was held back is returned so the screen can say so instead of
 *   silently showing a shorter history.
 * - Athlete feedback (mood, energy, comments) and coach evaluations: nothing the
 *   administration was asked to review, and both are consent categories.
 * - The CPF and any wearable biometrics, as in the other school detail screens.
 */
export class GetSchoolAthleteTraining {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, athleteId: string, raw: unknown = {}) {
    if (!idSchema.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!idSchema.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    if (!idSchema.safeParse(athleteId).success) throw this.notFound();
    const options = querySchema.parse(raw);

    const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    await new CanManageMembers(new SchoolMembershipRepository(this.db)).assert(actorUserId, school.id);

    const membership = await this.db.schoolAthleteMembership.findFirst({
      where: { schoolId: school.id, athleteId, status: "ACTIVE", endedAt: null },
      select: { id: true, startedAt: true, createdAt: true },
    });
    // Scoped to this school: an athlete of another school is simply not found here.
    if (!membership) throw this.notFound();

    const today = startOfUtcDay(this.clock());
    const periodStart = membership.startedAt ?? membership.createdAt;
    const inScope: Prisma.WorkoutAssignmentWhereInput = {
      schoolId: school.id,
      athleteId,
      status: { not: WorkoutAssignmentStatus.UNPLANNED },
      createdAt: { gte: periodStart },
    };
    const scoped = (filter: AthleteTrainingFilter): Prisma.WorkoutAssignmentWhereInput => ({
      AND: [inScope, assignmentFilterWhere(filter, today)],
    });

    const [athlete, coachAssignment, teams, counts, heldBack, openChangeRequests, rows] = await Promise.all([
      this.db.user.findUnique({ where: { id: athleteId }, select: { id: true, name: true, email: true, image: true } }),
      this.db.coachAthleteAssignment.findFirst({
        where: { schoolId: school.id, athleteId, status: "ACTIVE", isPrimary: true, endedAt: null },
        select: {
          coachId: true,
          coach: { select: { displayName: true, user: { select: { name: true } } } },
        },
      }),
      this.db.teamAthlete.findMany({
        where: { athleteId, team: { schoolId: school.id, archivedAt: null } },
        select: { team: { select: { name: true } } },
      }),
      Promise.all(ATHLETE_TRAINING_FILTERS.map((filter) =>
        this.db.workoutAssignment.count({ where: scoped(filter) }),
      )),
      this.db.workoutAssignment.count({
        where: {
          schoolId: school.id,
          athleteId,
          status: { not: WorkoutAssignmentStatus.UNPLANNED },
          createdAt: { lt: periodStart },
        },
      }),
      this.db.workoutChangeRequest.count({
        where: {
          schoolId: school.id,
          status: { in: OPEN_CHANGE_REQUEST_STATUSES },
          workoutAssignment: { athleteId, createdAt: { gte: periodStart } },
        },
      }),
      this.db.workoutAssignment.findMany({
        where: scoped(options.filter),
        select: {
          id: true, scheduledAt: true, status: true, sourceLabel: true, createdAt: true, coachId: true,
          coach: { select: { displayName: true, user: { select: { name: true } } } },
          team: { select: { name: true } },
          workout: {
            select: {
              title: true, description: true, sportType: true,
              blocks: {
                orderBy: { position: "asc" },
                select: {
                  id: true, blockType: true, title: true, durationS: true, distanceM: true,
                  repetitions: true, targetPayload: true, restPayload: true,
                },
              },
            },
          },
          executions: {
            where: { matchStatus: { in: MATCHED_EXECUTION_STATUSES } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true, source: true, startedAt: true, sportType: true, durationSeconds: true,
              distanceMeters: true, averageHeartRate: true, averagePower: true,
              compliance: { select: { overallScore: true } },
            },
          },
          changeRequests: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 5,
            select: {
              id: true, status: true, reason: true, resolutionNote: true, createdAt: true, resolvedAt: true,
              requester: { select: { name: true, email: true } },
            },
          },
        },
        // Upcoming reads soonest-first; everything else newest-first. Undated rows
        // (plan-calendar sessions not yet scheduled) always sink to the bottom so
        // they never push dated work off the first page.
        orderBy: [
          { scheduledAt: { sort: options.filter === "proximos" ? "asc" : "desc", nulls: "last" } },
          { id: "desc" },
        ],
        take: options.limit + 1,
      }),
    ]);
    if (!athlete) throw this.notFound();

    const items = rows.slice(0, options.limit).map((row) => {
      const execution = row.executions[0] ?? null;
      return {
        id: row.id,
        scheduledAt: row.scheduledAt,
        status: row.status,
        overdue: isAssignmentOverdue(row, today),
        sourceLabel: row.sourceLabel,
        team: row.team?.name ?? null,
        coach: row.coachId
          ? { id: row.coachId, name: row.coach?.displayName ?? row.coach?.user?.name ?? "Professor" }
          : null,
        workout: row.workout
          ? {
            title: row.workout.title,
            description: row.workout.description,
            sportType: row.workout.sportType,
            // Decimal does not survive the server → client boundary.
            blocks: row.workout.blocks.map((block) => ({
              ...block,
              distanceM: block.distanceM === null ? null : Number(block.distanceM),
            })),
          }
          : null,
        execution: execution
          ? {
            id: execution.id,
            source: execution.source,
            startedAt: execution.startedAt,
            sportType: execution.sportType,
            durationSeconds: execution.durationSeconds,
            distanceMeters: execution.distanceMeters,
            averageHeartRate: execution.averageHeartRate,
            averagePower: execution.averagePower,
            complianceScore: execution.compliance?.overallScore ?? null,
          }
          : null,
        changeRequests: row.changeRequests,
      };
    });

    const countByFilter = Object.fromEntries(
      ATHLETE_TRAINING_FILTERS.map((filter, index) => [filter, counts[index]]),
    ) as Record<AthleteTrainingFilter, number>;

    return {
      athlete,
      periodStart,
      currentCoach: coachAssignment
        ? {
          coachId: coachAssignment.coachId,
          name: coachAssignment.coach.displayName ?? coachAssignment.coach.user?.name ?? "Professor",
        }
        : null,
      teams: teams.map((entry) => entry.team.name),
      filter: options.filter,
      counts: countByFilter,
      openChangeRequests,
      heldBack,
      items,
      hasMore: rows.length > options.limit,
      limit: options.limit,
    };
  }

  private notFound() {
    return new SchoolError("ATHLETE_NOT_FOUND", "Atleta não encontrado nesta escola.", 404);
  }
}
