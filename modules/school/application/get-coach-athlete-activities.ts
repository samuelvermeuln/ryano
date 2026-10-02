/**
 * SAM-34 — what one athlete actually did, for the coach: imported activities
 * (any provider) and sessions the athlete logged by hand, each with its
 * prescribed × executed outcome and, when it fulfilled a prescription of this
 * scope, the prescription it belongs to.
 *
 * Reading rules:
 * - Who may read is `ResolveCoachAthleteContext` (school or independent).
 * - Rows start at the link's `periodStart`; earlier dates appear only where the
 *   athlete granted the `activities` consent category (ADR-005, SAM-33). The
 *   count held back is returned so the screen can say so.
 * - An activity linked to a prescription of ANOTHER scope (another school,
 *   another coach) is not "unplanned" — it fulfilled someone's plan — but that
 *   plan is not this coach's to see: `outcome`/`prescription` are null.
 * - Paging is in memory over the window, like the athlete's own list.
 */
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus } from "../domain/enums";
import { derivePrescriptionOutcome, PrescriptionOutcome } from "../domain/prescription-outcome";
import { isPrescriptionOfReader, ResolveActivityReaderContext, type ActivityReaderScopeInput } from "./activity-reader-context";
import { MATCHED_EXECUTION_STATUSES } from "./athlete-training-scope";
import { CanReadAthleteHistory } from "./can-read-athlete-history";
import { linkedActivityKeys, isActivityLinked, activityLinkKey } from "./unplanned-activities";

export const ACTIVITY_ORIGIN_FILTERS = ["todas", "nao-planejadas", "prescritas"] as const;
export type ActivityOriginFilter = (typeof ACTIVITY_ORIGIN_FILTERS)[number];
export const ACTIVITY_WINDOW_DAYS = [7, 30, 90, 365] as const;
export const ACTIVITY_PAGE_SIZE = 20;

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
  sportType: z.string().trim().min(1).max(100).optional(),
  origin: z.enum(ACTIVITY_ORIGIN_FILTERS).default("todas"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(ACTIVITY_PAGE_SIZE),
});

export type CoachAthleteActivityItem = {
  /** Imported from a provider (has an `Activity` row and a detail page) or logged by the athlete by hand. */
  kind: "imported" | "self-logged";
  /** `Activity.id` for imports; `WorkoutExecution.id` for self-logged sessions. */
  id: string;
  name: string | null;
  provider: string | null;
  sportType: string;
  startedAt: Date;
  durationSeconds: number | null;
  movingSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  averageHeartRate: number | null;
  averagePace: number | null;
  averageSpeed: number | null;
  elevationGain: number | null;
  /** Null when the activity fulfilled a prescription outside this scope. */
  outcome: PrescriptionOutcome | null;
  prescription: { assignmentId: string; title: string; status: string } | null;
};

type ExecutionRow = {
  id: string;
  activityId: string | null;
  source: string;
  externalId: string;
  sportType: string;
  startedAt: Date;
  durationSeconds: number | null;
  distanceMeters: number | null;
  averageHeartRate: number | null;
  averageSpeed: number | null;
  assignment: {
    id: string;
    status: string;
    schoolId: string | null;
    coachId: string | null;
    sourceLabel: string | null;
    workout: { title: string; sportType: string } | null;
  };
};

export class GetCoachAthleteActivities {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  /**
   * `scope`: a school id or `{ kind: "independent" }` for a coach, or
   * `{ kind: "school-admin", schoolId }` for the school's administration (SAM-37).
   */
  async execute(actorUserId: string | null, scope: ActivityReaderScopeInput, athleteId: string, raw: unknown = {}) {
    const context = await new ResolveActivityReaderContext(this.db, this.clock)
      .execute(actorUserId, scope, athleteId);
    const options = querySchema.parse(raw);
    const now = this.clock();
    const from = new Date(now.getTime() - options.days * 86_400_000);
    const sportFilter = options.sportType ? { sportType: options.sportType } : {};

    const historyAllowed = await new CanReadAthleteHistory(this.db, this.clock)
      .resolver(actorUserId, { athleteId, schoolId: context.schoolId, category: "activities" });
    const readable = (startedAt: Date) => startedAt >= context.periodStart || historyAllowed(startedAt);

    const [activities, executions, sportRows] = await Promise.all([
      this.db.activity.findMany({
        where: { userId: athleteId, startedAt: { gte: from }, ...sportFilter },
        select: {
          id: true, name: true, provider: true, externalId: true, sportType: true, startedAt: true,
          durationSeconds: true, movingSeconds: true, distanceMeters: true, calories: true,
          averageHeartRate: true, averagePace: true, averageSpeed: true, elevationGain: true,
        },
        orderBy: { startedAt: "desc" },
      }),
      // Every matched execution of the athlete in the window, whatever scope it
      // belongs to: that is what decides whether an activity is unplanned.
      this.db.workoutExecution.findMany({
        where: { athleteId, matchStatus: { in: MATCHED_EXECUTION_STATUSES }, startedAt: { gte: from }, ...sportFilter },
        select: {
          id: true, activityId: true, source: true, externalId: true, sportType: true, startedAt: true,
          durationSeconds: true, distanceMeters: true, averageHeartRate: true, averageSpeed: true,
          assignment: {
            select: {
              id: true, status: true, schoolId: true, coachId: true, sourceLabel: true,
              workout: { select: { title: true, sportType: true } },
            },
          },
        },
        orderBy: { startedAt: "desc" },
      }) as Promise<ExecutionRow[]>,
      this.db.activity.findMany({
        where: { userId: athleteId, startedAt: { gte: context.periodStart } },
        distinct: ["sportType"],
        select: { sportType: true },
        orderBy: { sportType: "asc" },
      }),
    ]);

    const keys = linkedActivityKeys(executions);
    const byActivityId = new Map(executions.filter((row) => row.activityId).map((row) => [row.activityId!, row]));
    const byExternal = new Map(executions.map((row) => [activityLinkKey(row.source, row.externalId), row]));
    const title = (assignment: ExecutionRow["assignment"]) =>
      assignment.workout?.title ?? assignment.sourceLabel ?? "Treino agendado";

    let withheldBeforePeriod = 0;
    const items: CoachAthleteActivityItem[] = [];

    for (const activity of activities) {
      if (!readable(activity.startedAt)) { withheldBeforePeriod += 1; continue; }
      const linked = isActivityLinked(activity, keys)
        ? byActivityId.get(activity.id) ?? byExternal.get(activityLinkKey(activity.provider, activity.externalId)) ?? null
        : null;
      let outcome: PrescriptionOutcome | null = PrescriptionOutcome.UNPLANNED_ACTIVITY;
      let prescription: CoachAthleteActivityItem["prescription"] = null;
      if (linked) {
        const inScope = isPrescriptionOfReader(linked.assignment, context)
          || linked.assignment.status === WorkoutAssignmentStatus.UNPLANNED;
        outcome = inScope
          ? derivePrescriptionOutcome({
            assignmentStatus: linked.assignment.status,
            workoutSportType: linked.assignment.workout?.sportType ?? null,
            matchedExecution: { sportType: linked.sportType },
          })
          : null;
        prescription = inScope && linked.assignment.status !== WorkoutAssignmentStatus.UNPLANNED
          ? { assignmentId: linked.assignment.id, title: title(linked.assignment), status: linked.assignment.status }
          : null;
      }
      items.push({
        kind: "imported",
        id: activity.id,
        name: activity.name,
        provider: activity.provider,
        sportType: activity.sportType,
        startedAt: activity.startedAt,
        durationSeconds: activity.durationSeconds,
        movingSeconds: activity.movingSeconds,
        distanceMeters: activity.distanceMeters,
        calories: activity.calories,
        averageHeartRate: activity.averageHeartRate,
        averagePace: activity.averagePace,
        averageSpeed: activity.averageSpeed,
        elevationGain: activity.elevationGain,
        outcome,
        prescription,
      });
    }

    // Sessions the athlete logged by hand: no Activity row, no provider.
    for (const execution of executions) {
      if (execution.assignment.status !== WorkoutAssignmentStatus.UNPLANNED || execution.activityId) continue;
      if (!readable(execution.startedAt)) { withheldBeforePeriod += 1; continue; }
      items.push({
        kind: "self-logged",
        id: execution.id,
        name: execution.assignment.workout?.title ?? "Atividade registrada",
        provider: null,
        sportType: execution.sportType,
        startedAt: execution.startedAt,
        durationSeconds: execution.durationSeconds,
        movingSeconds: null,
        distanceMeters: execution.distanceMeters,
        calories: null,
        averageHeartRate: execution.averageHeartRate,
        averagePace: null,
        averageSpeed: execution.averageSpeed,
        elevationGain: null,
        outcome: PrescriptionOutcome.UNPLANNED_ACTIVITY,
        prescription: null,
      });
    }

    const filtered = items
      .filter((item) => options.origin === "todas"
        || (options.origin === "nao-planejadas" ? item.outcome === PrescriptionOutcome.UNPLANNED_ACTIVITY : item.prescription !== null))
      .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime());

    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / options.limit));
    const page = Math.min(options.page, pageCount);
    const start = (page - 1) * options.limit;

    return {
      context,
      items: filtered.slice(start, start + options.limit),
      total,
      page,
      pageCount,
      days: options.days,
      origin: options.origin,
      sportType: options.sportType ?? null,
      availableSportTypes: sportRows.map((row) => row.sportType),
      unplannedCount: items.filter((item) => item.outcome === PrescriptionOutcome.UNPLANNED_ACTIVITY).length,
      withheldBeforePeriod,
    };
  }
}
