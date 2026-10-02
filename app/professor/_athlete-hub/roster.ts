/**
 * SAM-35 — one roster loader for both coaching scopes.
 *
 * "Meus atletas" inside a school (`/professor/[schoolId]/atletas`) and the
 * independent roster (`/professor/independente/atletas`) show the same cards
 * from the same facts: compliance, executions awaiting confirmation, last
 * prescription, and — new — the last activity, whether something happened
 * today and how today's prescription went (prescribed × executed, SAM-33).
 *
 * Only ACTIVE links are athletes; a PENDING request is not (the old roster
 * filtered `endedAt: null` alone and listed requests as athletes).
 * Prescription facts use the exact prescription scope of the hub
 * (`{ schoolId }` or `{ schoolId: null, coachId }`, ADR-009). Activity facts
 * are the athlete's own rows: an activity has no school.
 */
import type { PrismaClient } from "@prisma/client";
import { MATCHED_EXECUTION_STATUSES, OPEN_ASSIGNMENT_STATUSES, DONE_ASSIGNMENT_STATUSES } from "@/modules/school/application/athlete-training-scope";
import { prescriptionScope } from "@/modules/school/application/coach-athlete-scope";
import { splitLinkedActivities } from "@/modules/school/application/unplanned-activities";
import { WorkoutAssignmentStatus } from "@/modules/school/domain/enums";
import { addCalendarDays, localMidnightToUtc, todayLocalDate } from "@/modules/school/domain/local-date";
import { derivePrescriptionOutcome, type PrescriptionOutcome } from "@/modules/school/domain/prescription-outcome";
import type { CoachAthleteScope } from "./hub-scope";

export type RosterAthlete = {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  complianceAvg: number | null;
  complianceCount: number;
  pendingExecutions: number;
  /** Already formatted for display; `null` means never prescribed. */
  lastPrescriptionLabel: string | null;
  daysSinceLastPrescription: number | null;
  teamNames: string[];
  /** SAM-35 — the athlete's last activity (any provider), formatted; `null` when none. */
  lastActivityLabel: string | null;
  daysSinceLastActivity: number | null;
  /** Something happened today (imported or self-logged), prescribed or not. */
  activityToday: boolean;
  /** Today's prescription in this scope, with its prescribed × executed outcome; `null` when none. */
  todayPrescription: { assignmentId: string; title: string; outcome: PrescriptionOutcome | null } | null;
  /** An activity today that no prescription claims. */
  unplannedToday: boolean;
};

type RosterDb = Pick<PrismaClient, "coachAthleteAssignment" | "workoutCompliance" | "workoutExecution" | "workoutAssignment" | "teamAthlete" | "activity">;

export const STALE_ATHLETE_DAYS = 14;

function daysBetween(now: number, then: Date): number {
  return Math.floor((now - then.getTime()) / 86_400_000);
}

export async function loadCoachRoster(
  db: RosterDb,
  input: { coachId: string; scope: CoachAthleteScope; timeZone: string; now?: Date },
): Promise<RosterAthlete[]> {
  const now = input.now ?? new Date();
  const scoped = prescriptionScope({ schoolId: input.scope.kind === "school" ? input.scope.schoolId : null, coachId: input.coachId });

  const assignments = await db.coachAthleteAssignment.findMany({
    where: { ...scoped, coachId: input.coachId, status: "ACTIVE", endedAt: null },
    include: { athlete: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { startedAt: "asc" },
  });
  const athleteIds = assignments.map((assignment) => assignment.athleteId);
  if (athleteIds.length === 0) return [];

  const todayLocal = todayLocalDate(now, input.timeZone);
  const todayStart = localMidnightToUtc(todayLocal, input.timeZone);
  const todayEnd = localMidnightToUtc(addCalendarDays(todayLocal, 1), input.timeZone);
  const todayRange = { gte: todayStart, lt: todayEnd };

  const [complianceData, pendingData, lastPrescriptions, teamMemberships, lastActivities, todayActivities, todayExecutions, todayAssignments] = await Promise.all([
    db.workoutCompliance.groupBy({
      by: ["athleteId"],
      where: { athleteId: { in: athleteIds }, assignment: scoped },
      _avg: { overallScore: true },
      _count: true,
    }),
    db.workoutExecution.groupBy({
      by: ["athleteId"],
      where: { athleteId: { in: athleteIds }, matchStatus: "AUTO_MATCHED", assignment: scoped },
      _count: true,
    }),
    // Newest prescription per athlete, in one query.
    db.workoutAssignment.groupBy({
      by: ["athleteId"],
      where: { athleteId: { in: athleteIds }, ...scoped, coachId: input.coachId, status: { not: WorkoutAssignmentStatus.UNPLANNED } },
      _max: { scheduledAt: true, createdAt: true },
    }),
    input.scope.kind === "school"
      ? db.teamAthlete.findMany({
        where: { athleteId: { in: athleteIds }, team: { schoolId: input.scope.schoolId, archivedAt: null } },
        select: { athleteId: true, team: { select: { name: true } } },
      })
      : Promise.resolve([]),
    db.activity.groupBy({
      by: ["userId"],
      where: { userId: { in: athleteIds } },
      _max: { startedAt: true },
    }),
    db.activity.findMany({
      where: { userId: { in: athleteIds }, startedAt: todayRange },
      select: { id: true, userId: true, provider: true, externalId: true },
    }),
    db.workoutExecution.findMany({
      where: { athleteId: { in: athleteIds }, matchStatus: { in: MATCHED_EXECUTION_STATUSES }, startedAt: todayRange },
      select: { athleteId: true, activityId: true, source: true, externalId: true, sportType: true, workoutAssignmentId: true, assignment: { select: { status: true } } },
    }),
    db.workoutAssignment.findMany({
      where: {
        athleteId: { in: athleteIds }, ...scoped,
        status: { in: [...OPEN_ASSIGNMENT_STATUSES, ...DONE_ASSIGNMENT_STATUSES, WorkoutAssignmentStatus.MISSED, WorkoutAssignmentStatus.JUSTIFIED] },
        scheduledAt: todayRange,
      },
      select: { id: true, athleteId: true, status: true, sourceLabel: true, workout: { select: { title: true, sportType: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  const complianceMap = new Map(complianceData.map((row) => [row.athleteId, { avg: row._avg.overallScore, count: row._count }]));
  const pendingMap = new Map(pendingData.map((row) => [row.athleteId, row._count]));
  const lastPrescriptionMap = new Map(lastPrescriptions.map((row) => {
    const scheduled = row._max.scheduledAt;
    const created = row._max.createdAt;
    const latest = scheduled && created ? (scheduled > created ? scheduled : created) : scheduled ?? created;
    return [row.athleteId, latest];
  }));
  const teamsMap = new Map<string, string[]>();
  for (const membership of teamMemberships) {
    teamsMap.set(membership.athleteId, [...(teamsMap.get(membership.athleteId) ?? []), membership.team.name]);
  }
  const lastActivityMap = new Map(lastActivities.map((row) => [row.userId, row._max.startedAt]));
  const executionsByAthlete = new Map<string, typeof todayExecutions>();
  for (const execution of todayExecutions) {
    executionsByAthlete.set(execution.athleteId, [...(executionsByAthlete.get(execution.athleteId) ?? []), execution]);
  }
  const activitiesByAthlete = new Map<string, typeof todayActivities>();
  for (const activity of todayActivities) {
    activitiesByAthlete.set(activity.userId, [...(activitiesByAthlete.get(activity.userId) ?? []), activity]);
  }
  const todayAssignmentByAthlete = new Map<string, (typeof todayAssignments)[number]>();
  for (const assignment of todayAssignments) {
    if (!todayAssignmentByAthlete.has(assignment.athleteId)) todayAssignmentByAthlete.set(assignment.athleteId, assignment);
  }

  const nowMs = now.getTime();
  return assignments.map(({ athlete }) => {
    const compliance = complianceMap.get(athlete.id);
    const lastPrescribedAt = lastPrescriptionMap.get(athlete.id) ?? null;
    const lastActivityAt = lastActivityMap.get(athlete.id) ?? null;
    const executions = executionsByAthlete.get(athlete.id) ?? [];
    const activities = activitiesByAthlete.get(athlete.id) ?? [];
    const { unlinked } = splitLinkedActivities(executions, activities);
    const selfLoggedToday = executions.some((execution) => execution.assignment.status === WorkoutAssignmentStatus.UNPLANNED);
    const assignment = todayAssignmentByAthlete.get(athlete.id) ?? null;
    const matched = assignment ? executions.find((execution) => execution.workoutAssignmentId === assignment.id) ?? null : null;

    return {
      id: athlete.id,
      name: athlete.name ?? athlete.email ?? "Sem nome",
      email: athlete.email,
      image: athlete.image,
      complianceAvg: compliance?.avg ?? null,
      complianceCount: compliance?.count ?? 0,
      pendingExecutions: pendingMap.get(athlete.id) ?? 0,
      lastPrescriptionLabel: lastPrescribedAt ? new Date(lastPrescribedAt).toLocaleDateString("pt-BR") : null,
      daysSinceLastPrescription: lastPrescribedAt ? daysBetween(nowMs, new Date(lastPrescribedAt)) : null,
      teamNames: teamsMap.get(athlete.id) ?? [],
      lastActivityLabel: lastActivityAt ? new Date(lastActivityAt).toLocaleDateString("pt-BR") : null,
      daysSinceLastActivity: lastActivityAt ? daysBetween(nowMs, new Date(lastActivityAt)) : null,
      activityToday: activities.length > 0 || selfLoggedToday,
      todayPrescription: assignment
        ? {
          assignmentId: assignment.id,
          title: assignment.workout?.title ?? assignment.sourceLabel ?? "Treino agendado",
          outcome: derivePrescriptionOutcome({
            assignmentStatus: assignment.status,
            workoutSportType: assignment.workout?.sportType ?? null,
            matchedExecution: matched ? { sportType: matched.sportType } : null,
          }),
        }
        : null,
      unplannedToday: unlinked.length > 0 || selfLoggedToday,
    };
  });
}

/** The roster's headline numbers, shared by both pages. */
export function summarizeRoster(athletes: readonly RosterAthlete[]) {
  const needingAttention = athletes.filter((athlete) =>
    athlete.pendingExecutions > 0
    || athlete.daysSinceLastPrescription === null
    || athlete.daysSinceLastPrescription >= STALE_ATHLETE_DAYS).length;
  const scored = athletes.filter((athlete) => athlete.complianceAvg != null);
  const rosterAverage = scored.length === 0
    ? null
    : scored.reduce((total, athlete) => total + (athlete.complianceAvg ?? 0), 0) / scored.length;
  return {
    needingAttention,
    pendingConfirmations: athletes.reduce((total, athlete) => total + athlete.pendingExecutions, 0),
    activeToday: athletes.filter((athlete) => athlete.activityToday).length,
    scoredCount: scored.length,
    rosterAverage,
  };
}
