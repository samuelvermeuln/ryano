/**
 * SAM-62 — auditable and reversible prescription ↔ activity links (§2.2,
 * §17.3, AC10).
 *
 * - Every link/confirm/unlink writes `WorkoutAssignmentHistory` (who, when,
 *   method, confidence, reason). Undo never deletes: the execution becomes
 *   NO_MATCH with who/when/why and can be linked again.
 * - Only the athlete, or the assignment's coach while they can still read the
 *   athlete's current data, acts on a link (a coach without a link does not).
 * - Linking an activity of another sport is the coach's decision (§17.3).
 * - Several activities may make one session ("somar"); another activity may
 *   replace the current one ("trocar"); an activity linked elsewhere moves,
 *   and the other session's trail says so.
 */
import { recordMilestoneEvidence } from "./milestone-evidence";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { WorkoutAssignmentStatus, WorkoutMatchStatus } from "../domain/enums";
import { SchoolError } from "../domain/errors";
import { buildMatchDetail } from "../domain/workout-matching";
import { plannedTotalsOfRows } from "../domain/workout-structure";
import { CLEARED_MATCH, matchedActivityData } from "../infrastructure/activity-link";
import { triggerComplianceCalculation, type ExecutionDetailLoader } from "./calculate-workout-compliance";
import { CanReadAthleteCurrentData } from "./can-read-athlete-current-data";

type Tx = Prisma.TransactionClient;
type Clock = () => Date;
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;

export const ACTIVE_MATCH_STATUSES = [WorkoutMatchStatus.AUTO_MATCHED, WorkoutMatchStatus.PENDING, WorkoutMatchStatus.CONFIRMED, WorkoutMatchStatus.OVERRIDDEN] as const;
export const MATCH_HISTORY_EVENTS = ["MATCH_LINKED", "MATCH_CONFIRMED", "MATCH_UNLINKED"] as const;
export type MatchActorKind = "athlete" | "coach";

/** Athlete, or the assignment's coach still allowed to read the athlete now. */
export async function resolveMatchActor(
  tx: Tx,
  actorUserId: string,
  assignment: { athleteId: string; coachId: string | null; schoolId: string | null },
  now: Date,
): Promise<MatchActorKind> {
  if (assignment.athleteId === actorUserId) return "athlete";
  const coach = await tx.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
  if (coach && coach.id === assignment.coachId
    && await new CanReadAthleteCurrentData(tx as PrismaClient, () => now).execute(actorUserId, { athleteId: assignment.athleteId, schoolId: assignment.schoolId })) {
    return "coach";
  }
  throw new SchoolError("FORBIDDEN", "Apenas o atleta ou o professor responsável altera esta associação.", 403);
}

export async function recordMatchHistory(
  tx: Tx,
  entry: { assignmentId: string; eventType: (typeof MATCH_HISTORY_EVENTS)[number]; actorUserId: string; now: Date; payload: Record<string, unknown> },
) {
  await tx.workoutAssignmentHistory.create({
    data: {
      id: randomUUID(), workoutAssignmentId: entry.assignmentId, eventType: entry.eventType, actorUserId: entry.actorUserId,
      payload: entry.payload as Prisma.InputJsonValue, createdAt: entry.now,
    },
  });
}

/**
 * Undo one link without deleting anything. The assignment goes back to
 * SCHEDULED when nothing remains linked, and its pointer is cleared or moved
 * to a remaining link.
 */
export async function unlinkExecution(
  tx: Tx,
  execution: { id: string; workoutAssignmentId: string; activityId: string | null; matchStatus: string; matchScore: number },
  actor: { userId: string; kind: MatchActorKind | "system" },
  reason: string | null,
  now: Date,
) {
  await tx.workoutExecution.update({
    where: { id: execution.id },
    data: { matchStatus: WorkoutMatchStatus.NO_MATCH, unlinkedAt: now, unlinkedByUserId: actor.userId, unlinkReason: reason, updatedAt: now },
  });
  const assignment = await tx.workoutAssignment.findUniqueOrThrow({ where: { id: execution.workoutAssignmentId }, select: { status: true, matchedActivityId: true } });
  const remaining = await tx.workoutExecution.findFirst({
    where: { workoutAssignmentId: execution.workoutAssignmentId, matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } },
    orderBy: { startedAt: "asc" },
    select: { activityId: true, matchStatus: true, matchScore: true },
  });
  const revert = !remaining && assignment.status === WorkoutAssignmentStatus.AVAILABLE;
  const pointerGone = execution.activityId !== null && assignment.matchedActivityId === execution.activityId;
  if (revert || pointerGone) {
    await tx.workoutAssignment.update({
      where: { id: execution.workoutAssignmentId },
      data: {
        ...(revert ? { status: WorkoutAssignmentStatus.SCHEDULED } : {}),
        ...(pointerGone ? (remaining ? matchedActivityData(remaining, now) : CLEARED_MATCH) : {}),
        updatedAt: now,
      },
    });
  }
  await recordMatchHistory(tx, {
    assignmentId: execution.workoutAssignmentId, eventType: "MATCH_UNLINKED", actorUserId: actor.userId, now,
    payload: { executionId: execution.id, activityId: execution.activityId, by: actor.kind, previousStatus: execution.matchStatus, score: execution.matchScore, reason },
  });
}

// ---------------------------------------------------------------------------
// Link an imported activity (replace or add)
// ---------------------------------------------------------------------------

const id = z.string().min(1).max(256).refine((v) => v.trim() === v);

export const linkActivitySchema = z.strictObject({
  assignmentId: id,
  activityId: id,
  /** "replace" = trocar a atividade da sessão; "add" = mais um arquivo da mesma sessão. */
  mode: z.enum(["replace", "add"]).default("replace"),
  reason: z.string().trim().max(500).nullish().transform((v) => (v ? v : null)),
});

const ASSIGNMENT_FOR_MATCH = {
  id: true, athleteId: true, coachId: true, schoolId: true, status: true, matchedActivityId: true,
  workout: { select: { sportType: true, scheduledDate: true, scheduledStartAt: true, blocks: { select: { blockType: true, durationS: true, distanceM: true, repetitions: true, restPayload: true } } } },
} as const;

function detailFor(
  workout: { sportType: string; scheduledDate: Date | null; scheduledStartAt: Date | null; blocks: NonNullable<Parameters<typeof plannedTotalsOfRows>[0]> },
  activity: { provider: string; externalId: string; sportType: string; startedAt: Date; durationSeconds: number | null; distanceMeters: number | null },
) {
  const totals = plannedTotalsOfRows(workout.blocks);
  return buildMatchDetail({
    workout: { sportType: workout.sportType, scheduledDate: workout.scheduledDate, scheduledStartAt: workout.scheduledStartAt },
    prescribedDurationSeconds: totals.durationSeconds,
    prescribedDistanceMeters: totals.distanceMeters,
    blockCount: workout.blocks.length,
    activity: {
      source: activity.provider, externalId: activity.externalId, sportType: activity.sportType, providerSportType: activity.sportType,
      startedAt: activity.startedAt, durationSeconds: activity.durationSeconds ?? undefined, distanceMeters: activity.distanceMeters ?? undefined,
    },
  });
}

export class LinkActivityToAssignment {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date(), private readonly loadDetail: ExecutionDetailLoader | null = null) {}

  async execute(actorUserId: string | null, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = linkActivitySchema.parse(raw);
    let linked;
    try {
      linked = await this.db.$transaction((tx) => this.link(tx, actorUserId, input), TX);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        throw new SchoolError("WORKOUT_ASSIGN_CONFLICT", "A associação mudou enquanto você editava. Atualize e tente novamente.", 409);
      }
      throw error;
    }
    await triggerComplianceCalculation(this.db, linked.id, this.clock, this.loadDetail);
    return linked;
  }

  private async link(tx: Tx, actorUserId: string, input: z.infer<typeof linkActivitySchema>) {
    const now = this.clock();
    const assignment = await tx.workoutAssignment.findUnique({ where: { id: input.assignmentId }, select: ASSIGNMENT_FOR_MATCH });
    if (!assignment) throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Treino não encontrado.", 404);
    const actor = await resolveMatchActor(tx, actorUserId, assignment, now);
    if (assignment.status === WorkoutAssignmentStatus.CANCELLED) throw new SchoolError("WORKOUT_ASSIGNMENT_CANCELLED", "Este treino foi cancelado.", 409);
    if (!assignment.workout) throw new SchoolError("ASSIGNMENT_NO_WORKOUT", "Prescrição sem treino associado.", 409);

    const activity = await tx.activity.findUnique({ where: { id: input.activityId } });
    if (!activity || activity.userId !== assignment.athleteId) throw new SchoolError("ACTIVITY_NOT_FOUND", "Atividade não encontrada.", 404);
    if (activity.sportType !== assignment.workout.sportType && actor !== "coach") {
      throw new SchoolError("OTHER_SPORT_COACH_DECIDES", "Atividade de outra modalidade: a substituição é decisão do professor.", 422);
    }
    const detail = detailFor(assignment.workout, activity);
    const method = actor === "coach" ? "COACH" : "ATHLETE";

    // The same activity active on another session moves; that session's trail says so.
    const elsewhere = await tx.workoutExecution.findMany({
      where: { activityId: activity.id, workoutAssignmentId: { not: assignment.id }, matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } },
    });
    for (const other of elsewhere) {
      await unlinkExecution(tx, other, { userId: actorUserId, kind: actor }, "associada a outra sessão", now);
    }
    if (input.mode === "replace") {
      const current = await tx.workoutExecution.findMany({
        where: { workoutAssignmentId: assignment.id, matchStatus: { in: [...ACTIVE_MATCH_STATUSES] }, NOT: { activityId: activity.id } },
      });
      for (const execution of current) {
        await unlinkExecution(tx, execution, { userId: actorUserId, kind: actor }, input.reason ?? "substituída por outra atividade", now);
      }
    }

    const data = {
      matchStatus: WorkoutMatchStatus.OVERRIDDEN, matchScore: detail.composite, matchDetail: detail as unknown as Prisma.InputJsonValue,
      matchMethod: method, matchedByUserId: actorUserId, unlinkedAt: null, unlinkedByUserId: null, unlinkReason: null, updatedAt: now,
    };
    const existing = await tx.workoutExecution.findFirst({
      where: { workoutAssignmentId: assignment.id, source: { in: [activity.provider, activity.provider.toLowerCase()] }, externalId: activity.externalId },
    });
    const linked = existing
      // Relinking revives the same row: its review, feedback and trail stay with it.
      ? await tx.workoutExecution.update({ where: { id: existing.id }, data: { ...data, activityId: activity.id } })
      : await tx.workoutExecution.create({
        data: {
          id: randomUUID(), workoutAssignmentId: assignment.id, athleteId: assignment.athleteId, source: activity.provider, externalId: activity.externalId,
          activityId: activity.id, sportType: activity.sportType, startedAt: activity.startedAt, durationSeconds: activity.durationSeconds,
          movingSeconds: activity.movingSeconds, distanceMeters: activity.distanceMeters, averageHeartRate: activity.averageHeartRate,
          maxHeartRate: activity.maxHeartRate, averageSpeed: activity.averageSpeed, elevationGain: activity.elevationGain,
          averagePower: activity.averagePower === null ? null : Math.round(activity.averagePower),
          activityPayload: { source: "linked-by-user", activityId: activity.id }, createdAt: now, ...data,
        },
      });

    // SAM-71 — the linked activity is evidence for the milestones of this session.
    await recordMilestoneEvidence(tx, assignment.id, now);
    const refreshed = await tx.workoutAssignment.findUniqueOrThrow({ where: { id: assignment.id }, select: { status: true, matchedActivityId: true } });
    const pointTo = input.mode === "replace" || refreshed.matchedActivityId === null;
    await tx.workoutAssignment.update({
      where: { id: assignment.id },
      data: {
        ...(refreshed.status === WorkoutAssignmentStatus.SCHEDULED ? { status: WorkoutAssignmentStatus.AVAILABLE } : {}),
        ...(pointTo ? matchedActivityData(linked, now) : {}),
        updatedAt: now,
      },
    });
    await recordMatchHistory(tx, {
      assignmentId: assignment.id, eventType: "MATCH_LINKED", actorUserId, now,
      payload: {
        executionId: linked.id, activityId: activity.id, method, mode: input.mode, score: detail.composite,
        otherSport: activity.sportType !== assignment.workout.sportType, dayDifference: detail.facts.dayDifference, reason: input.reason,
      },
    });
    return linked;
  }
}

// ---------------------------------------------------------------------------
// Candidates to link to a session
// ---------------------------------------------------------------------------

const CANDIDATE_WINDOW_DAYS = 3;

export class ListMatchCandidates {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, assignmentId: string) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const now = this.clock();
    const assignment = await this.db.workoutAssignment.findUnique({ where: { id: assignmentId }, select: { ...ASSIGNMENT_FOR_MATCH, scheduledAt: true } });
    if (!assignment || !assignment.workout) throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Treino não encontrado.", 404);
    const actor = await resolveMatchActor(this.db as unknown as Tx, actorUserId, assignment, now);
    const center = assignment.scheduledAt ?? now;
    const windowMs = CANDIDATE_WINDOW_DAYS * 86_400_000;
    const activities = await this.db.activity.findMany({
      where: {
        userId: assignment.athleteId, duplicateOfActivityId: null, parentActivityId: null,
        startedAt: { gte: new Date(center.getTime() - windowMs), lte: new Date(Math.min(center.getTime() + windowMs, now.getTime() + 60_000)) },
      },
      orderBy: { startedAt: "desc" },
      take: 30,
      select: { id: true, provider: true, externalId: true, sportType: true, name: true, startedAt: true, durationSeconds: true, distanceMeters: true },
    });
    const links = await this.db.workoutExecution.findMany({
      where: { activityId: { in: activities.map((activity) => activity.id) }, matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } },
      select: { activityId: true, workoutAssignmentId: true, assignment: { select: { workout: { select: { title: true } } } } },
    });
    const workout = assignment.workout;
    return {
      actor,
      candidates: activities
        .map((activity) => {
          const detail = detailFor(workout, activity);
          const link = links.find((row) => row.activityId === activity.id) ?? null;
          return {
            ...activity,
            score: detail.composite,
            detail,
            otherSport: !detail.facts.sameSport,
            /** §17.3 — another sport stays recorded; only the coach links it. */
            allowed: detail.facts.sameSport || actor === "coach",
            linkedHere: link?.workoutAssignmentId === assignment.id,
            linkedElsewhere: link && link.workoutAssignmentId !== assignment.id ? { assignmentId: link.workoutAssignmentId, title: link.assignment.workout?.title ?? null } : null,
          };
        })
        .sort((a, b) => b.score - a.score),
    };
  }
}

// ---------------------------------------------------------------------------
// What the detail screens show
// ---------------------------------------------------------------------------

export async function loadMatchPanel(db: PrismaClient, assignmentId: string) {
  const [executions, history] = await Promise.all([
    db.workoutExecution.findMany({
      where: { workoutAssignmentId: assignmentId, OR: [{ matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } }, { unlinkedAt: { not: null } }] },
      orderBy: { startedAt: "asc" },
      select: {
        id: true, matchStatus: true, matchScore: true, matchDetail: true, matchMethod: true, source: true, sportType: true, startedAt: true,
        durationSeconds: true, distanceMeters: true, activityId: true, unlinkedAt: true, unlinkReason: true, providerRemovedAt: true,
      },
    }),
    db.workoutAssignmentHistory.findMany({
      where: { workoutAssignmentId: assignmentId, eventType: { in: [...MATCH_HISTORY_EVENTS] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, eventType: true, payload: true, createdAt: true, actor: { select: { name: true } } },
    }),
  ]);
  return { executions, history };
}
