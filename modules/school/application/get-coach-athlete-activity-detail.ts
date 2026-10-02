/**
 * SAM-34 — one imported activity of the athlete, for the coach.
 *
 * Authorisation is `ResolveCoachAthleteContext`; an activity of another
 * athlete, or dated before this link's period without the `activities`
 * consent, is simply not found from this URL (no existence leak). The visual
 * data comes from the provider enrichers, injected by the app layer exactly
 * as `GetCoachAthleteWorkoutDetail` does, so the school module stays
 * provider-agnostic. The enricher resolves credentials from the activity's
 * own connection, never from the reader's.
 */
import type { Activity, PrismaClient } from "@prisma/client";
import { SchoolError } from "../domain/errors";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { derivePrescriptionOutcome, PrescriptionOutcome } from "../domain/prescription-outcome";
import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";
import { isPrescriptionOfReader, ResolveActivityReaderContext, type ActivityReaderScopeInput } from "./activity-reader-context";
import { MATCHED_EXECUTION_STATUSES } from "./athlete-training-scope";
import { CanReadAthleteHistory } from "./can-read-athlete-history";
import { executionSourceVariants } from "./match-persisted-activity";

export type ActivityVisualDataLoader = (activity: Activity) => Promise<ActivityVisualData>;

export class GetCoachAthleteActivityDetail {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
    private readonly loadActivityVisualData: ActivityVisualDataLoader | null = null,
  ) {}

  private notFound(): SchoolError {
    return new SchoolError("ACTIVITY_NOT_FOUND", "Atividade não encontrada.", 404);
  }

  /** `scope` as in `GetCoachAthleteActivities`: coach (school id / independent) or `{ kind: "school-admin", schoolId }`. */
  async execute(actorUserId: string | null, scope: ActivityReaderScopeInput, athleteId: string, activityId: string) {
    const context = await new ResolveActivityReaderContext(this.db, this.clock)
      .execute(actorUserId, scope, athleteId);

    const activity = await this.db.activity.findUnique({ where: { id: activityId } });
    if (!activity || activity.userId !== athleteId) throw this.notFound();

    if (activity.startedAt < context.periodStart) {
      const allowed = await new CanReadAthleteHistory(this.db, this.clock).execute(actorUserId, {
        athleteId, schoolId: context.schoolId, category: "activities", occurredAt: activity.startedAt,
      });
      if (!allowed) throw this.notFound();
    }

    const execution = await this.db.workoutExecution.findFirst({
      where: {
        athleteId,
        matchStatus: { in: MATCHED_EXECUTION_STATUSES },
        OR: [
          { activityId: activity.id },
          { source: { in: executionSourceVariants(activity.provider) }, externalId: activity.externalId },
        ],
      },
      select: {
        id: true, sportType: true,
        assignment: {
          select: {
            id: true, status: true, schoolId: true, coachId: true, sourceLabel: true,
            workout: { select: { title: true, sportType: true } },
          },
        },
      },
    });

    let outcome: PrescriptionOutcome | null = PrescriptionOutcome.UNPLANNED_ACTIVITY;
    let prescription: { assignmentId: string; title: string; status: string } | null = null;
    if (execution) {
      const inScope = isPrescriptionOfReader(execution.assignment, context);
      outcome = inScope
        ? derivePrescriptionOutcome({
          assignmentStatus: execution.assignment.status,
          workoutSportType: execution.assignment.workout?.sportType ?? null,
          matchedExecution: { sportType: execution.sportType },
        })
        : null;
      prescription = inScope && execution.assignment.status !== WorkoutAssignmentStatus.UNPLANNED
        ? {
          assignmentId: execution.assignment.id,
          title: execution.assignment.workout?.title ?? execution.assignment.sourceLabel ?? "Treino agendado",
          status: execution.assignment.status,
        }
        : null;
    }

    // A provider failure degrades to the base view, never to a failed page.
    let visualData: ActivityVisualData | null = null;
    if (this.loadActivityVisualData) {
      try {
        visualData = await this.loadActivityVisualData(activity);
      } catch {
        visualData = null;
      }
    }

    return {
      context,
      activity: {
        id: activity.id,
        name: activity.name,
        provider: activity.provider,
        sportType: activity.sportType,
        startedAt: activity.startedAt,
      },
      /** SAM-40 — the persisted row (aggregates + extended stats) for the shared detail model. */
      activityRow: activity,
      visualData,
      outcome,
      prescription,
    };
  }
}
