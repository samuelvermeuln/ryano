/**
 * SAM-76 — the preparation's evolution report (§17.7, §8.2, §8.4): period,
 * agreed goals next to the athlete's wish, phases, milestones with their
 * objective state and evidence, key sessions with a summarized comparison,
 * comparable history (same modality/environment; open water with its
 * conditions, "comparação limitada"), the coach's reviews and conflicts with
 * other events. Composed from the plan, the goals, the reviews and the
 * results already in place — nothing is recomputed, nothing is scored as
 * readiness. The athlete sees what is visible to them (reviews marked
 * visible, no analysis notes); the responsible coach and the school see all.
 */
import type { PrismaClient } from "@prisma/client";

import { todayLocalDate } from "../domain/local-date";
import { milestoneCompletionLabel, milestoneReportState, REPORT_STATE_LABELS, type ReportState } from "../domain/preparation-report";
import { ListAthleteGoals } from "./athlete-goals";
import { loadAuthorized } from "./event-preparations";
import { ACTIVE_MATCH_STATUSES } from "./match-audit";
import { loadOpenWaterView } from "./open-water-sessions";
import { resultOfParticipation } from "./participation-results";
import { GetPreparationPlan } from "./preparation-plan";

type Clock = () => Date;

export class GetPreparationReport {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, preparationId: string) {
    const { row, role } = await loadAuthorized(this.db, this.clock, actorUserId, preparationId);
    const athleteId = row.participation.athleteId;
    const participationId = row.participation.id;
    const event = row.participation.event;
    const now = this.clock();
    const today = todayLocalDate(now, event.timeZone ?? "America/Sao_Paulo");

    const [plan, goalPairs, reviews, result, others, priority] = await Promise.all([
      new GetPreparationPlan(this.db, this.clock).execute(actorUserId, preparationId),
      new ListAthleteGoals(this.db).execute(actorUserId, athleteId).catch(() => []),
      this.db.coachReview.findMany({
        where: { eventPreparationId: preparationId, targetType: "PREPARATION", ...(role === "athlete" ? { isVisible: true } : {}) },
        orderBy: { createdAt: "desc" },
        select: { observation: true, decision: true, justification: true, updatedAt: true, author: { select: { name: true } } },
      }),
      resultOfParticipation(this.db, participationId),
      this.db.athleteEventParticipation.findMany({
        where: { athleteId, id: { not: participationId }, status: { not: "CANCELLED" }, event: { status: { not: "CANCELLED" }, startLocalDate: { gte: today } } },
        select: { id: true, agreedPriority: true, suggestedPriority: true, event: { select: { name: true, startLocalDate: true, sportType: true } } },
        orderBy: { event: { startLocalDate: "asc" } },
      }),
      this.db.athleteEventParticipation.findUnique({ where: { id: participationId }, select: { agreedPriority: true, suggestedPriority: true } }),
    ]);

    // Key sessions: the sessions linked to this event, each with what the comparison already says.
    const sessionIds = plan.sessions.map((session) => session.assignmentId);
    const [assignments, reviewedIds] = await Promise.all([
      this.db.workoutAssignment.findMany({
        where: { id: { in: sessionIds } },
        select: {
          id: true, status: true, scheduledAt: true,
          workout: { select: { title: true, sportType: true } },
          executions: { where: { matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } }, take: 1, select: { durationSeconds: true, distanceMeters: true, compliance: { select: { overallScore: true, breakdown: true } } } },
        },
      }),
      this.db.coachReview.findMany({ where: { workoutAssignmentId: { in: sessionIds }, ...(role === "athlete" ? { isVisible: true } : {}) }, select: { workoutAssignmentId: true } }).then((rows) => new Set(rows.map((item) => item.workoutAssignmentId))),
    ]);
    const openWaterViews = new Map(await Promise.all(assignments.filter((assignment) => assignment.workout?.sportType === "open-water").map(async (assignment) => [assignment.id, await loadOpenWaterView(this.db, assignment.id).catch(() => null)] as const)));

    const keySessions = assignments.map((assignment) => {
      const execution = assignment.executions[0] ?? null;
      const breakdown = (execution?.compliance?.breakdown ?? {}) as { adherence?: number; coverage?: number };
      const openWater = openWaterViews.get(assignment.id) ?? null;
      const comparison = openWater?.comparison ?? null;
      return {
        assignmentId: assignment.id,
        title: assignment.workout?.title ?? "Sessão",
        sportType: assignment.workout?.sportType ?? null,
        scheduledAt: assignment.scheduledAt,
        status: assignment.status,
        executed: execution !== null,
        reviewed: reviewedIds.has(assignment.id),
        durationSeconds: execution?.durationSeconds ?? null,
        distanceMeters: execution?.distanceMeters ?? null,
        complianceScore: execution?.compliance?.overallScore ?? null,
        adherencePct: breakdown.adherence ?? null,
        coveragePct: breakdown.coverage ?? null,
        // §17.7 — comparable only with the same modality/environment/protocol; open water says what differs.
        comparable: comparison ? { comparable: comparison.comparable, sentence: comparison.sentence } : null,
        phaseId: plan.sessions.find((session) => session.assignmentId === assignment.id)?.phaseId ?? null,
        milestoneId: plan.sessions.find((session) => session.assignmentId === assignment.id)?.milestoneId ?? null,
        otherEvents: plan.sessions.find((session) => session.assignmentId === assignment.id)?.otherEvents ?? [],
      };
    }).sort((a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0));

    const milestones = plan.milestones.map((milestone) => {
      const sessions = milestone.sessions.map((session) => ({ ...session, reviewed: reviewedIds.has(session.assignmentId) }));
      const state: ReportState = milestoneReportState({ status: milestone.status, dueLocalDate: milestone.dueLocalDate, sessions }, today);
      return { ...milestone, state, stateLabel: REPORT_STATE_LABELS[state], evidence: sessions.filter((session) => session.executed).map((session) => session.title) };
    });
    const achieved = milestones.filter((milestone) => milestone.state === "ACHIEVED").length;
    const isMain = (item: (typeof others)[number]) => (item.agreedPriority ?? item.suggestedPriority) === "MAIN";
    const thisIsMain = (priority?.agreedPriority ?? priority?.suggestedPriority) === "MAIN";
    const pairs = goalPairs.filter((pair) => pair.desired?.participationId === participationId || pair.agreed.some((goal) => goal.participationId === participationId));

    return {
      role,
      event: { name: event.name, startLocalDate: event.startLocalDate, sportType: event.sportType, timeZone: event.timeZone },
      athleteName: row.participation.athlete.name,
      period: { startedAt: row.startedAt, closedAt: row.closedAt, eventLocalDate: event.startLocalDate, todayLocalDate: today },
      status: row.status,
      goals: pairs,
      phases: plan.phases,
      milestones,
      completion: { achieved, total: milestones.length, label: milestoneCompletionLabel(achieved, milestones.length) },
      keySessions,
      totals: plan.totals,
      reviews: reviews.map((review) => ({ observation: review.observation, decision: review.decision, justification: review.justification, updatedAt: review.updatedAt, authorName: review.author?.name ?? null })),
      result: result ? { status: result.status } : null,
      conflicts: thisIsMain ? others.filter(isMain).map((item) => ({ participationId: item.id, name: item.event.name, startLocalDate: item.event.startLocalDate })) : [],
      formerGoals: plan.formerGoals,
    };
  }
}
export type PreparationReportView = Awaited<ReturnType<GetPreparationReport["execute"]>>;
