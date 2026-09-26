import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageMembers } from "./can-manage-members";
import { resolveSchoolCoach } from "./resolve-school-coach";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);
const querySchema = z.strictObject({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const COUNTED_STATUSES = [
  WorkoutAssignmentStatus.SCHEDULED,
  WorkoutAssignmentStatus.AVAILABLE,
  WorkoutAssignmentStatus.COMPLETED,
  WorkoutAssignmentStatus.PARTIALLY_COMPLETED,
  WorkoutAssignmentStatus.MISSED,
  WorkoutAssignmentStatus.CANCELLED,
  WorkoutAssignmentStatus.RESCHEDULED,
  WorkoutAssignmentStatus.JUSTIFIED,
  WorkoutAssignmentStatus.UNPLANNED,
] as const;

function averageOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

/**
 * Managerial summary of one coach's work inside one school over a window.
 *
 * Counts are reported per status instead of as a single "adherence" number:
 * a school administrator needs to see that 12 sessions were missed, not a score
 * that hides whether the coach prescribed little or the athletes skipped a lot.
 */
export class GetCoachManagementReport {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, schoolId: string, membershipId: string, raw: unknown = {}) {
    if (!idSchema.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (!idSchema.safeParse(schoolId).success) {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    if (!idSchema.safeParse(membershipId).success) {
      throw new SchoolError("COACH_SCHOOL_MEMBERSHIP_NOT_FOUND", "Vínculo do professor não encontrado.", 404);
    }
    const { days } = querySchema.parse(raw);

    const school = await this.db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!school) throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    await new CanManageMembers(new SchoolMembershipRepository(this.db)).assert(actorUserId, school.id);
    const { coachId } = await resolveSchoolCoach(this.db, school.id, membershipId);

    const until = this.clock();
    const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
    const window = { schoolId: school.id, coachId, createdAt: { gte: since, lte: until } };

    const [byStatus, athleteCount, evaluations, assignmentIds, pendingChangeRequests] = await Promise.all([
      this.db.workoutAssignment.groupBy({
        by: ["status"],
        where: window,
        _count: { _all: true },
      }),
      this.db.coachAthleteAssignment.count({
        where: { schoolId: school.id, coachId, status: "ACTIVE" },
      }),
      this.db.coachEvaluation.findMany({
        where: { schoolId: school.id, coachId, createdAt: { gte: since, lte: until } },
        select: { overallScore: true },
      }),
      this.db.workoutAssignment.findMany({ where: window, select: { id: true } }),
      this.db.workoutChangeRequest.count({
        where: { schoolId: school.id, coachId, status: "PENDING" },
      }),
    ]);

    const compliances = assignmentIds.length === 0 ? [] : await this.db.workoutCompliance.findMany({
      where: { workoutAssignmentId: { in: assignmentIds.map(({ id }) => id) } },
      select: { overallScore: true },
    });

    const counts = Object.fromEntries(COUNTED_STATUSES.map((status) => [status, 0])) as
      Record<(typeof COUNTED_STATUSES)[number], number>;
    for (const row of byStatus) {
      if (row.status in counts) counts[row.status as keyof typeof counts] = row._count._all;
    }

    return {
      window: { since, until, days },
      activeAthletes: athleteCount,
      prescriptions: {
        total: assignmentIds.length,
        byStatus: counts,
      },
      evaluations: {
        total: evaluations.length,
        averageScore: averageOf(evaluations.map(({ overallScore }) => overallScore)),
      },
      compliance: {
        measured: compliances.length,
        averageScore: averageOf(compliances.map(({ overallScore }) => overallScore)),
      },
      pendingChangeRequests,
    };
  }
}
