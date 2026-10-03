/**
 * SAM-75 — multisport in the application layer (§16, §17.3, §22.5, AC13).
 *
 * - `loadActivitySegments`: the provider's legs (read from the persisted
 *   payload — nothing is persisted twice) plus the explicit selections.
 * - `linkProviderChildCopies`: when the provider itself says a per-sport
 *   copy belongs to a multisport parent, the copy points at the parent and
 *   counts once. Similarity never links anything (ADR-003).
 * - `SelectActivitySegment`: the athlete or the coach marks a trecho of a
 *   file, optionally for a prescription; ranges never overlap.
 * - `LinkBrick`: the coach chains sessions in order; `brickOf` reads the
 *   chain with what was executed, for the comparison.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { CanReadAthleteCurrentData } from "@/modules/school/application/can-read-athlete-current-data";
import { SchoolError } from "@/modules/school/domain/errors";
import {
  brickComparison, legsFromGarminTypedSplits, segmentsFromProviderLegs, segmentTotals, selectionSchema, validateSelections, type ActivitySegmentView, type SegmentKind, type SegmentOrigin,
} from "../domain/multisport";

const MATCHED = ["AUTO_MATCHED", "CONFIRMED", "OVERRIDDEN"] as const;

export async function loadActivitySegments(db: PrismaClient, activity: { id: string; metrics: unknown; durationSeconds: number | null }) {
  const [rows, children] = await Promise.all([
    db.activitySegment.findMany({ where: { activityId: activity.id }, orderBy: { order: "asc" }, include: { assignment: { select: { id: true, workout: { select: { title: true } } } } } }),
    db.activity.findMany({ where: { parentActivityId: activity.id }, select: { id: true, sportType: true, durationSeconds: true, distanceMeters: true, provider: true } }),
  ]);
  const provider = segmentsFromProviderLegs(legsFromGarminTypedSplits(activity.metrics));
  const selections: Array<ActivitySegmentView & { id: string; assignment: { id: string; title: string } | null }> = rows.map((row, index) => ({
    id: row.id, order: provider.length + index + 1, kind: row.kind as SegmentKind, sportType: row.sportType,
    startOffsetSeconds: row.startOffsetSeconds, endOffsetSeconds: row.endOffsetSeconds, durationSeconds: row.endOffsetSeconds - row.startOffsetSeconds,
    distanceMeters: row.distanceMeters === null ? null : Number(row.distanceMeters), origin: row.origin as SegmentOrigin, label: row.label,
    assignment: row.assignment ? { id: row.assignment.id, title: row.assignment.workout?.title ?? "Sessão" } : null,
  }));
  return { provider, selections, totals: segmentTotals(provider), children, durationSeconds: activity.durationSeconds };
}
export type ActivitySegmentsView = Awaited<ReturnType<typeof loadActivitySegments>>;

/**
 * Garmin names a child's parent as `parentSummaryId` on the activity summary;
 * when it is there and the parent is this athlete's, the copy becomes a child.
 * Nothing is inferred from timing or sport.
 */
export async function linkProviderChildCopies(db: PrismaClient, activity: { id: string; userId: string; provider: string; rawPayload: unknown; metrics: unknown }) {
  const payload = (activity.rawPayload ?? activity.metrics ?? {}) as Record<string, unknown>;
  const parentExternalId = payload.parentSummaryId ?? payload.parentActivityId ?? payload.parentId;
  if (parentExternalId === undefined || parentExternalId === null) return { linked: false as const };
  const parent = await db.activity.findFirst({ where: { userId: activity.userId, provider: activity.provider as never, externalId: String(parentExternalId) }, select: { id: true } });
  if (!parent || parent.id === activity.id) return { linked: false as const };
  await db.activity.updateMany({ where: { id: activity.id, parentActivityId: null }, data: { parentActivityId: parent.id } });
  return { linked: true as const, parentId: parent.id };
}

async function roleFor(db: PrismaClient, actorUserId: string, athleteId: string, now: Date) {
  if (athleteId === actorUserId) return "athlete" as const;
  const links = await db.coachAthleteAssignment.findMany({ where: { athleteId, status: "ACTIVE", coach: { userId: actorUserId } }, select: { schoolId: true } });
  for (const link of links) {
    if (await new CanReadAthleteCurrentData(db, () => now).execute(actorUserId, { athleteId, schoolId: link.schoolId })) return "coach" as const;
  }
  return null;
}

export class SelectActivitySegment {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, activityId: string, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = selectionSchema.and(z.object({ workoutAssignmentId: z.string().min(1).max(256).nullish() })).parse(raw);
    const activity = await this.db.activity.findUnique({ where: { id: activityId }, select: { id: true, userId: true, durationSeconds: true } });
    if (!activity) throw new SchoolError("ACTIVITY_NOT_FOUND", "Atividade não encontrada.", 404);
    const now = this.clock();
    const role = await roleFor(this.db, actorUserId, activity.userId, now);
    if (!role) throw new SchoolError("ACTIVITY_NOT_FOUND", "Atividade não encontrada.", 404);
    if (input.workoutAssignmentId) {
      const assignment = await this.db.workoutAssignment.findUnique({ where: { id: input.workoutAssignmentId }, select: { athleteId: true } });
      if (!assignment || assignment.athleteId !== activity.userId) throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Sessão não encontrada.", 404);
    }
    const existing = await this.db.activitySegment.findMany({ where: { activityId }, select: { startOffsetSeconds: true, endOffsetSeconds: true, order: true } });
    const duration = activity.durationSeconds ?? input.endOffsetSeconds;
    const check = validateSelections(duration, existing, [input]);
    if (!check.ok) throw new SchoolError("SEGMENT_OVERLAP", check.reason, 422);
    return this.db.activitySegment.create({
      data: {
        id: randomUUID(), activityId, order: existing.length + 1, kind: input.kind, sportType: null,
        startOffsetSeconds: input.startOffsetSeconds, endOffsetSeconds: input.endOffsetSeconds, label: input.label,
        origin: role === "athlete" ? "ATHLETE_SELECTION" : "COACH_SELECTION", workoutAssignmentId: input.workoutAssignmentId ?? null, createdByUserId: actorUserId, createdAt: now,
      },
      select: { id: true, order: true },
    });
  }
}

const brickSchema = z.strictObject({ assignmentIds: z.array(z.string().min(1).max(256)).min(2).max(6) });

export class LinkBrick {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  /** The coach's own sessions of one athlete, chained by scheduled time (§16.3). */
  async execute(actorUserId: string | null, raw: unknown) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const input = brickSchema.parse(raw);
    const coach = await this.db.coachProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
    if (!coach) throw new SchoolError("FORBIDDEN", "Só o professor encadeia sessões.", 403);
    const rows = await this.db.workoutAssignment.findMany({ where: { id: { in: input.assignmentIds }, coachId: coach.id, status: { not: "CANCELLED" } }, select: { id: true, athleteId: true, scheduledAt: true } });
    if (rows.length !== input.assignmentIds.length || new Set(rows.map((row) => row.athleteId)).size !== 1) {
      throw new SchoolError("VALIDATION_ERROR", "Encadeie sessões suas, do mesmo aluno.", 422);
    }
    const groupId = randomUUID();
    const ordered = [...rows].sort((a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0));
    await this.db.$transaction(ordered.map((row, index) => this.db.workoutAssignment.update({ where: { id: row.id }, data: { brickGroupId: groupId, brickOrder: index + 1, updatedAt: this.clock() } })), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { brickGroupId: groupId, order: ordered.map((row) => row.id) };
  }
}

export async function brickOf(db: PrismaClient, assignmentId: string) {
  const row = await db.workoutAssignment.findUnique({ where: { id: assignmentId }, select: { brickGroupId: true } });
  if (!row?.brickGroupId) return null;
  const legs = await db.workoutAssignment.findMany({
    where: { brickGroupId: row.brickGroupId, status: { not: "CANCELLED" } },
    orderBy: { brickOrder: "asc" },
    select: {
      id: true, brickOrder: true, scheduledAt: true, workout: { select: { title: true, sportType: true } },
      executions: { where: { matchStatus: { in: [...MATCHED] } }, orderBy: { createdAt: "asc" }, take: 1, select: { startedAt: true, durationSeconds: true } },
    },
  });
  const comparison = brickComparison(legs.map((leg) => ({
    order: leg.brickOrder ?? 0, title: leg.workout?.title ?? "Sessão", sportType: leg.workout?.sportType ?? "default",
    startedAt: leg.executions[0]?.startedAt ?? leg.scheduledAt, durationSeconds: leg.executions[0]?.durationSeconds ?? null, executed: leg.executions.length > 0,
  })));
  return { brickGroupId: row.brickGroupId, legs: legs.map((leg, index) => ({ assignmentId: leg.id, ...comparison.rows[index]! })), elapsedSeconds: comparison.elapsedSeconds, elapsedLegend: comparison.elapsedLegend };
}
