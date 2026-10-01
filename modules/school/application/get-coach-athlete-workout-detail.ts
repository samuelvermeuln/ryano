/**
 * One prescription in full, as the coach responsible for it needs to read it:
 * the prescribed structure, what was actually executed, the two side by side,
 * the compliance breakdown, the athlete's own feedback and the change trail.
 *
 * Two things are gated rather than simply selected:
 *
 * - **Athlete feedback** (`rpe`, mood, energy, comment) is a consent category
 *   (`athleteFeedback` in `historyGrantScopeSchema`, ADR-005). It is included
 *   only when `CanReadAthleteHistory` says this actor may read it, dated at the
 *   execution. A coach with partial history access therefore sees the
 *   prescription and the metrics but not the subjective feedback, and the screen
 *   says so instead of rendering an empty block.
 * - **Evaluations** are filtered to the acting coach's own, matching what the
 *   existing evaluation screens expose.
 *
 * No compliance formula is computed here: `WorkoutCompliance` is produced by
 * `CalculateWorkoutCompliance` and only read.
 */
import type { Activity, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";
import { MATCHED_EXECUTION_STATUSES, isAssignmentOverdue, startOfUtcDay } from "./athlete-training-scope";
import { CanReadAthleteHistory } from "./can-read-athlete-history";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";
import { SchoolError } from "../domain/errors";
import { buildWorkoutInsights, type WorkoutInsights } from "../presentation/workout-insights";

const opaqueId = z.string().min(1).max(256).refine((value) => value.trim() === value);

/**
 * SAM-17 — how the activity's detail (zones, laps) is obtained. Injected by the
 * caller because the provider modules own it (`getActivityVisualData` and the
 * Garmin → Strava fallback) and this module stays provider-agnostic; the use
 * case owns *when* it is called: only for a matched execution with a linked
 * activity, after the athlete-read authorization passed.
 */
export type ActivityVisualDataLoader = (activity: Activity) => Promise<ActivityVisualData | null>;

export class GetCoachAthleteWorkoutDetail {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
    private readonly loadActivityVisualData: ActivityVisualDataLoader | null = null,
  ) {}

  async execute(actorUserId: string | null, schoolId: string, athleteId: string, assignmentId: string) {
    const context = await new ResolveCoachAthleteContext(this.db, this.clock)
      .execute(actorUserId, schoolId, athleteId);
    if (!opaqueId.safeParse(assignmentId).success) throw this.notFound();

    const assignment = await this.db.workoutAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true, athleteId: true, schoolId: true, scheduledAt: true, dueAt: true,
        status: true, sourceLabel: true, createdAt: true, coachId: true,
        coach: { select: { displayName: true, user: { select: { name: true } } } },
        team: { select: { name: true } },
        workout: {
          select: {
            id: true, title: true, description: true, sportType: true,
            blocks: {
              orderBy: { position: "asc" },
              select: {
                id: true, position: true, blockType: true, title: true,
                durationS: true, distanceM: true, repetitions: true,
                targetPayload: true, restPayload: true,
              },
            },
          },
        },
        executions: {
          where: { matchStatus: { in: MATCHED_EXECUTION_STATUSES } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true, source: true, startedAt: true, sportType: true,
            durationSeconds: true, movingSeconds: true, distanceMeters: true,
            averageHeartRate: true, maxHeartRate: true, averageSpeed: true,
            elevationGain: true, averagePower: true, matchStatus: true, matchScore: true,
            activityId: true,
            // SAM-17 — the full row: the provider enrichers take the Activity as is.
            activity: true,
            compliance: { select: { overallScore: true, breakdown: true, strategyKey: true, calculatedAt: true } },
            feedback: { select: { rpe: true, mood: true, energy: true, comment: true, createdAt: true } },
            evaluations: {
              where: { coachId: context.coachId },
              select: { overallScore: true, note: true, createdAt: true },
              take: 1,
            },
          },
        },
        changeRequests: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 10,
          select: {
            id: true, status: true, reason: true, resolutionNote: true,
            createdAt: true, resolvedAt: true,
            requester: { select: { name: true, email: true } },
          },
        },
        history: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 20,
          select: {
            id: true, eventType: true, createdAt: true,
            actor: { select: { name: true, email: true } },
          },
        },
      },
    });

    // Scoped, not just looked up: an assignment of another athlete or another
    // school is simply not found from this URL.
    if (
      !assignment
      || assignment.athleteId !== athleteId
      || assignment.schoolId !== context.schoolId
      || assignment.createdAt < context.periodStart
    ) {
      throw this.notFound();
    }

    const execution = assignment.executions[0] ?? null;

    // Subjective feedback needs the athlete's explicit consent for the date it
    // belongs to; without it the caller is told the reason rather than handed an
    // empty object it would render as "no feedback".
    const feedbackAllowed = execution?.feedback
      ? await new CanReadAthleteHistory(this.db, this.clock).execute(actorUserId, {
        athleteId,
        schoolId: context.schoolId,
        category: "athleteFeedback",
        occurredAt: execution.startedAt,
      })
      : false;

    const today = startOfUtcDay(this.clock());
    const blocks = assignment.workout?.blocks.map((block) => ({
      ...block,
      // Decimal does not survive the server → client boundary.
      distanceM: block.distanceM === null ? null : Number(block.distanceM),
    })) ?? null;

    // SAM-17 — zones/laps/overlay from the linked activity. A provider failure
    // degrades to "no insights", never to a failed page.
    let insights: WorkoutInsights | null = null;
    if (execution?.activity && this.loadActivityVisualData) {
      let visualData: ActivityVisualData | null = null;
      try {
        visualData = await this.loadActivityVisualData(execution.activity);
      } catch {
        visualData = null;
      }
      insights = buildWorkoutInsights(visualData, blocks ?? [], assignment.workout?.sportType ?? execution.sportType);
    }

    return {
      context,
      assignment: {
        id: assignment.id,
        scheduledAt: assignment.scheduledAt,
        dueAt: assignment.dueAt,
        status: assignment.status,
        overdue: isAssignmentOverdue(assignment, today),
        sourceLabel: assignment.sourceLabel,
        team: assignment.team?.name ?? null,
        coach: assignment.coachId
          ? {
            id: assignment.coachId,
            name: assignment.coach?.displayName ?? assignment.coach?.user?.name ?? "Professor",
          }
          : null,
        /** Whether the acting coach owns this prescription, which is who may revise it. */
        isOwnPrescription: assignment.coachId === context.coachId,
      },
      workout: assignment.workout
        ? {
          id: assignment.workout.id,
          title: assignment.workout.title,
          description: assignment.workout.description,
          sportType: assignment.workout.sportType,
          blocks: blocks ?? [],
        }
        : null,
      execution: execution
        ? (({ activity, evaluations, feedback, ...rest }) => ({
          // The raw Activity row stays server-side; what crosses to the screen is `insights`.
          ...rest,
          activityProvider: activity?.provider ?? null,
          hasLinkedActivity: rest.activityId !== null,
          evaluation: evaluations[0] ?? null,
          feedback: feedbackAllowed ? feedback : null,
        }))(execution)
        : null,
      /** SAM-17 — null when there is no linked activity or it carries no zones/laps. */
      insights,
      /** True when feedback exists but consent for this date does not cover it. */
      feedbackWithheld: Boolean(execution?.feedback) && !feedbackAllowed,
      changeRequests: assignment.changeRequests,
      history: assignment.history,
    };
  }

  private notFound() {
    return new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Treino não encontrado para este atleta.", 404);
  }
}
