/**
 * SAM-53 — use cases for structured goals (§5.4, §8.4, §20).
 *
 * Authorization reuses `resolveEventActor`: the athlete, or a coach / the
 * school while the relation is active (404 otherwise). The athlete writes and
 * edits only wishes (ATHLETE_DESIRED); the agreed goal (COACH_AGREED) is the
 * coach's side and the athlete never edits it. A coach may register a wish
 * on the athlete's behalf — the author stays recorded (`createdByUserId`).
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { GOAL_REVIEW_FIELDS, goalInputSchema, goalPatchSchema } from "../domain/athlete-goal";
import { diffFields } from "../domain/sport-event";
import { resolveEventActor } from "./sport-events";

const opaqueId = z.string().min(1).max(256);

const decimal = (value: number | null | undefined) => (value === undefined ? undefined : value);

export class CreateAthleteGoal {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown) {
    const input = goalInputSchema.parse(raw);
    const athleteId = input.athleteId ?? actorUserId ?? "";
    const actor = await resolveEventActor(this.db, this.clock, actorUserId, athleteId);
    if (input.origin === "COACH_AGREED" && actor.kind === "athlete") {
      throw new SchoolError("FORBIDDEN", "O objetivo pactuado é registrado pelo professor.", 403);
    }
    if (input.participationId) {
      const participation = await this.db.athleteEventParticipation.findFirst({ where: { id: input.participationId, athleteId }, select: { id: true } });
      if (!participation) throw new SchoolError("PARTICIPATION_NOT_FOUND", "Participação não encontrada.", 404);
    }
    if (input.desiredGoalId) {
      const wish = await this.db.athleteGoal.findFirst({ where: { id: input.desiredGoalId, athleteId, origin: "ATHLETE_DESIRED" }, select: { id: true } });
      if (!wish) throw new SchoolError("GOAL_NOT_FOUND", "Objetivo desejado não encontrado.", 404);
    }
    const now = this.clock();
    return this.db.athleteGoal.create({
      data: {
        id: randomUUID(),
        athleteId,
        participationId: input.participationId,
        type: input.type,
        description: input.description,
        indicator: input.indicator,
        unit: input.unit,
        segment: input.segment,
        baselineValue: input.baselineValue,
        targetValue: input.targetValue,
        targetMin: input.targetMin,
        targetMax: input.targetMax,
        dueLocalDate: input.dueLocalDate,
        evaluationMethod: input.evaluationMethod,
        acceptedEvidence: input.acceptedEvidence,
        origin: input.origin,
        desiredGoalId: input.desiredGoalId,
        responsibleUserId: actor.kind === "athlete" ? null : actorUserId,
        createdByUserId: actorUserId!,
        createdAt: now,
        updatedAt: now,
      },
    });
  }
}

export class UpdateAthleteGoal {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, goalId: string, raw: unknown) {
    const current = await this.db.athleteGoal.findUnique({ where: { id: opaqueId.parse(goalId) } });
    if (!current) throw new SchoolError("GOAL_NOT_FOUND", "Objetivo não encontrado.", 404);
    const actor = await resolveEventActor(this.db, this.clock, actorUserId, current.athleteId);
    if (current.origin === "COACH_AGREED" && actor.kind === "athlete") {
      throw new SchoolError("FORBIDDEN", "O objetivo pactuado só é alterado pelo professor.", 403);
    }
    const patch = goalPatchSchema.parse(raw);
    if (patch.participationId) {
      const participation = await this.db.athleteEventParticipation.findFirst({ where: { id: patch.participationId, athleteId: current.athleteId }, select: { id: true } });
      if (!participation) throw new SchoolError("PARTICIPATION_NOT_FOUND", "Participação não encontrada.", 404);
    }
    const { expectedVersion, reason, ...fields } = patch;
    const comparable = Object.fromEntries(Object.entries(current).map(([key, value]) => [key, value instanceof Prisma.Decimal ? Number(value) : value]));
    const changes = diffFields(comparable, fields);
    if (Object.keys(changes).length === 0) return current;
    const now = this.clock();
    const needsReview = actor.kind === "athlete" && GOAL_REVIEW_FIELDS.some((field) => field in changes);

    return this.db.$transaction(async (tx) => {
      const updated = await tx.athleteGoal.updateMany({
        where: { id: current.id, version: expectedVersion },
        data: {
          ...fields,
          baselineValue: decimal(fields.baselineValue),
          targetValue: decimal(fields.targetValue),
          targetMin: decimal(fields.targetMin),
          targetMax: decimal(fields.targetMax),
          version: { increment: 1 },
          updatedAt: now,
          ...(needsReview && !current.needsReviewSince ? { needsReviewSince: now } : {}),
          // The coach looking at the goal again clears the pending review.
          ...(actor.kind !== "athlete" && current.needsReviewSince ? { needsReviewSince: null } : {}),
        },
      });
      if (updated.count === 0) {
        throw new SchoolError("GOAL_CONFLICT", "Este objetivo foi alterado por outra pessoa. Recarregue e tente de novo.", 409);
      }
      await tx.athleteGoalRevision.create({
        data: { id: randomUUID(), goalId: current.id, changedByUserId: actorUserId!, changes: changes as Prisma.InputJsonValue, reason: reason ?? fields.statusReason ?? null, changedAt: now },
      });
      return tx.athleteGoal.findUniqueOrThrow({ where: { id: current.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 });
  }
}

export type GoalView = {
  id: string;
  type: string;
  description: string;
  indicator: string | null;
  unit: string | null;
  segment: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  targetMin: number | null;
  targetMax: number | null;
  dueLocalDate: string | null;
  evaluationMethod: string | null;
  acceptedEvidence: string | null;
  status: string;
  statusReason: string | null;
  origin: string;
  participationId: string | null;
  needsReview: boolean;
  createdByName: string | null;
  version: number;
  revisions: Array<{ changedAt: Date; changedByName: string | null; changes: unknown; reason: string | null }>;
};

/** A wish next to the goal(s) agreed in answer to it (§5.4 "lado a lado"). */
export type GoalPair = { desired: GoalView | null; agreed: GoalView[] };

export class ListAthleteGoals {
  constructor(private readonly db: PrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async execute(actorUserId: string | null, athleteId: string): Promise<GoalPair[]> {
    await resolveEventActor(this.db, this.clock, actorUserId, athleteId);
    const rows = await this.db.athleteGoal.findMany({
      where: { athleteId },
      include: {
        createdBy: { select: { name: true } },
        revisions: { orderBy: { changedAt: "desc" }, include: { changedBy: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });
    const view = (row: (typeof rows)[number]): GoalView => ({
      id: row.id,
      type: row.type,
      description: row.description,
      indicator: row.indicator,
      unit: row.unit,
      segment: row.segment,
      baselineValue: row.baselineValue == null ? null : Number(row.baselineValue),
      targetValue: row.targetValue == null ? null : Number(row.targetValue),
      targetMin: row.targetMin == null ? null : Number(row.targetMin),
      targetMax: row.targetMax == null ? null : Number(row.targetMax),
      dueLocalDate: row.dueLocalDate,
      evaluationMethod: row.evaluationMethod,
      acceptedEvidence: row.acceptedEvidence,
      status: row.status,
      statusReason: row.statusReason,
      origin: row.origin,
      participationId: row.participationId,
      needsReview: row.needsReviewSince !== null,
      createdByName: row.createdBy.name,
      version: row.version,
      revisions: row.revisions.map((revision) => ({ changedAt: revision.changedAt, changedByName: revision.changedBy.name, changes: revision.changes, reason: revision.reason })),
    });
    const desired = rows.filter((row) => row.origin === "ATHLETE_DESIRED");
    const pairs: GoalPair[] = desired.map((wish) => ({
      desired: view(wish),
      agreed: rows.filter((row) => row.desiredGoalId === wish.id).map(view),
    }));
    // Agreed goals that answer no wish (the coach set them directly).
    for (const row of rows) {
      if (row.origin === "COACH_AGREED" && !row.desiredGoalId) pairs.push({ desired: null, agreed: [view(row)] });
    }
    return pairs;
  }
}
