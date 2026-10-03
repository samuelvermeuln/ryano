/**
 * SAM-71 — the plan of a preparation: phases, verifiable milestones, the
 * sessions tagged with the event, and the moves after a postponement
 * (§8, §5.5, §22.4).
 *
 * - Reading follows the preparation's roles (athlete, responsible coach,
 *   collaborator, school); only the responsible coach changes the plan.
 * - Changing a phase keeps the previous content as a revision with author
 *   and reason. Phases may be absent or overlap; no ratio is imposed (§8.1).
 * - Linked evidence moves an open milestone to EVIDENCE_RECEIVED; only the
 *   coach's decision (a review targeting the milestone) closes it (§8.3).
 * - A session linked to several events counts once for the athlete (§8.4).
 * - Moving a block of sessions after the event moved is the coach's act: a
 *   preview with conflicts, then one new prescription version per session.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { SchoolError } from "../domain/errors";
import { localDateTimeToUtc } from "../domain/local-date";
import {
  goalAsOf, isMilestoneOpen, MILESTONE_DECISIONS, MILESTONE_MANUAL_STATUSES, MILESTONE_STATUS_LABELS, milestoneInputSchema,
  phaseInputSchema, phaseLabel, sessionTotalsAcrossEvents, shiftLocalDate, type MilestoneStatus,
} from "../domain/preparation-plan";
import { plannedTotalsOfRows } from "../domain/workout-structure";
import { SaveCoachReview } from "./coach-reviews";
import { loadAuthorized } from "./event-preparations";
import { syncParticipationReminders } from "./follow-up-reminders";
import { recordMilestoneEvidence } from "./milestone-evidence";
import { ACTIVE_MATCH_STATUSES } from "./match-audit";
import { GetRevisionBaseline, ReviseWorkoutAssignment } from "./prescription-revisions";
import { ResolveCoachAthleteContext } from "./resolve-coach-athlete-context";

type Clock = () => Date;
type Tx = Prisma.TransactionClient;
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;
const opaqueId = z.string().min(1).max(256);

async function requireResponsible(db: PrismaClient, clock: Clock, actorUserId: string | null, preparationId: string) {
  const { row, role } = await loadAuthorized(db, clock, actorUserId, preparationId);
  if (role !== "responsible") throw new SchoolError("FORBIDDEN", "Só o professor responsável altera o plano da preparação.", 403);
  if (row.status === "CLOSED") throw new SchoolError("PREPARATION_CLOSED", "Esta preparação já foi encerrada.", 409);
  return row;
}

async function sessionHasEvidence(tx: Tx, assignmentId: string) {
  const [execution, report] = await Promise.all([
    tx.workoutExecution.findFirst({ where: { workoutAssignmentId: assignmentId, matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } }, select: { id: true } }),
    tx.athleteFeedback.findFirst({ where: { workoutAssignmentId: assignmentId, completion: { not: null } }, select: { id: true } }),
  ]);
  return Boolean(execution || report);
}

export class GetPreparationPlan {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, preparationId: string) {
    const { row, role } = await loadAuthorized(this.db, this.clock, actorUserId, preparationId);
    const athleteId = row.participation.athleteId;
    const participationId = row.participation.id;
    const now = this.clock();
    const [phases, milestones, athleteLinks, linkable, movedGoals] = await Promise.all([
      this.db.preparationPhase.findMany({
        where: { preparationId, removedAt: null },
        orderBy: [{ startLocalDate: "asc" }, { createdAt: "asc" }],
        include: { revisions: { orderBy: { version: "desc" }, include: { phase: false } } },
      }),
      this.db.preparationMilestone.findMany({
        where: { preparationId },
        orderBy: [{ dueLocalDate: "asc" }, { createdAt: "asc" }],
        include: { reviews: { where: role === "athlete" ? { isVisible: true } : {}, take: 1, orderBy: { updatedAt: "desc" } } },
      }),
      // Every event link of the athlete: the totals count a shared session once.
      this.db.workoutAssignmentEventLink.findMany({
        where: { assignment: { athleteId } },
        select: {
          id: true, assignmentId: true, participationId: true, phaseId: true, milestoneId: true,
          participation: { select: { agreedPriority: true, event: { select: { name: true } } } },
          assignment: {
            select: {
              scheduledAt: true, status: true,
              workout: { select: { title: true, blocks: { select: { blockType: true, durationS: true, distanceM: true, repetitions: true, targetPayload: true, restPayload: true } } } },
              executions: { where: { matchStatus: { in: [...ACTIVE_MATCH_STATUSES] } }, select: { id: true }, take: 1 },
            },
          },
        },
      }),
      role === "responsible" && row.coach
        ? this.db.workoutAssignment.findMany({
          where: {
            athleteId, coachId: row.coach.id, status: { not: "CANCELLED" },
            scheduledAt: { gte: new Date(now.getTime() - 21 * 86_400_000), lte: new Date(now.getTime() + 120 * 86_400_000) },
          },
          orderBy: { scheduledAt: "asc" },
          take: 80,
          select: { id: true, scheduledAt: true, workout: { select: { title: true } } },
        })
        : [],
      // §8.4 — goals that pointed at this event before the target changed stay readable as they were.
      this.db.athleteGoalRevision.findMany({
        where: { changes: { path: ["participationId", "from"], equals: participationId } },
        orderBy: { changedAt: "desc" },
        take: 10,
        select: { goalId: true, changedAt: true, reason: true, changedBy: { select: { name: true } } },
      }),
    ]);

    const formerGoals = await Promise.all(movedGoals.map(async (moved) => {
      const goal = await this.db.athleteGoal.findUnique({ where: { id: moved.goalId }, include: { revisions: { select: { changedAt: true, changes: true } } } });
      if (!goal || goal.athleteId !== athleteId) return null;
      const before = goalAsOf(goal as unknown as Record<string, unknown>, goal.revisions, new Date(moved.changedAt.getTime() - 1));
      return {
        goalId: goal.id,
        description: String(before.description ?? ""),
        dueLocalDate: (before.dueLocalDate as string | null) ?? null,
        movedAt: moved.changedAt,
        reason: moved.reason,
        movedByName: moved.changedBy?.name ?? null,
      };
    }));

    const duration = (link: (typeof athleteLinks)[number]) => {
      const blocks = link.assignment.workout?.blocks ?? [];
      return plannedTotalsOfRows(blocks.map((block) => ({ ...block, distanceM: block.distanceM === null ? null : Number(block.distanceM) }))).durationSeconds;
    };
    const totals = sessionTotalsAcrossEvents(athleteLinks.map((link) => ({
      assignmentId: link.assignmentId, participationId: link.participationId, durationSeconds: duration(link), mainEvent: link.participation.agreedPriority === "MAIN",
    })));
    const linksHere = athleteLinks.filter((link) => link.participationId === participationId);
    const otherEventsOf = (assignmentId: string) => athleteLinks
      .filter((link) => link.assignmentId === assignmentId && link.participationId !== participationId)
      .map((link) => link.participation.event.name);
    const sessionView = (link: (typeof athleteLinks)[number]) => ({
      linkId: link.id,
      assignmentId: link.assignmentId,
      title: link.assignment.workout?.title ?? "Sessão",
      scheduledAt: link.assignment.scheduledAt,
      status: link.assignment.status,
      executed: link.assignment.executions.length > 0,
      phaseId: link.phaseId,
      milestoneId: link.milestoneId,
      otherEvents: otherEventsOf(link.assignmentId),
      mainEventConflict: totals.mainEventConflicts.includes(link.assignmentId),
    });

    return {
      preparationId,
      participationId,
      athleteId,
      schoolId: row.schoolId,
      role,
      editable: role === "responsible" && row.status !== "CLOSED",
      phases: phases.map((phase) => ({
        id: phase.id, type: phase.type, label: phaseLabel(phase), customName: phase.customName,
        startLocalDate: phase.startLocalDate, endLocalDate: phase.endLocalDate, purpose: phase.purpose,
        sportTypes: phase.sportTypes, protocolNotes: phase.protocolNotes, version: phase.version,
        revisions: phase.revisions.map((revision) => ({ version: revision.version, changedAt: revision.changedAt, reason: revision.reason })),
      })),
      milestones: milestones.map((milestone) => ({
        id: milestone.id, title: milestone.title, criterion: milestone.criterion, dueLocalDate: milestone.dueLocalDate,
        evidenceType: milestone.evidenceType, status: milestone.status as MilestoneStatus,
        statusLabel: MILESTONE_STATUS_LABELS[milestone.status as MilestoneStatus] ?? milestone.status,
        phaseId: milestone.phaseId, evidenceAt: milestone.evidenceAt, decidedAt: milestone.decidedAt,
        sessions: linksHere.filter((link) => link.milestoneId === milestone.id).map(sessionView),
        review: milestone.reviews[0] ? { observation: milestone.reviews[0].observation, updatedAt: milestone.reviews[0].updatedAt } : null,
      })),
      sessions: linksHere.map(sessionView),
      totals: {
        event: totals.perEvent[participationId] ?? { sessions: 0, seconds: 0 },
        athlete: totals.athlete,
        shared: linksHere.filter((link) => totals.sharedSessions.includes(link.assignmentId)).length,
        mainEventConflicts: linksHere.filter((link) => totals.mainEventConflicts.includes(link.assignmentId)).length,
      },
      linkableSessions: linkable.map((session) => ({ assignmentId: session.id, title: session.workout?.title ?? "Sessão", scheduledAt: session.scheduledAt })),
      formerGoals: formerGoals.filter((goal): goal is NonNullable<typeof goal> => goal !== null),
    };
  }
}
export type PreparationPlanView = Awaited<ReturnType<GetPreparationPlan["execute"]>>;

const phaseChangeSchema = z.strictObject({
  phaseId: opaqueId.nullish(),
  expectedVersion: z.number().int().min(1).nullish(),
  reason: z.string().trim().max(1000).nullish().transform((value) => value || null),
  phase: z.unknown(),
});

export class SavePreparationPhase {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, preparationId: string, raw: unknown) {
    await requireResponsible(this.db, this.clock, actorUserId, preparationId);
    const { phaseId, expectedVersion, reason, phase: rawPhase } = phaseChangeSchema.parse(raw);
    const input = phaseInputSchema.parse(rawPhase);
    const now = this.clock();
    return this.db.$transaction(async (tx) => {
      if (!phaseId) {
        return tx.preparationPhase.create({ data: { id: randomUUID(), preparationId, ...input, createdByUserId: actorUserId!, createdAt: now, updatedAt: now } });
      }
      // Altering a phase is a new version with author and reason (§8 issue scope).
      if (!reason) throw new z.ZodError([{ code: "custom", path: ["reason"], message: "Diga por que a fase mudou.", input: reason }]);
      const current = await tx.preparationPhase.findFirst({ where: { id: phaseId, preparationId, removedAt: null } });
      if (!current) throw new SchoolError("PHASE_NOT_FOUND", "Fase não encontrada.", 404);
      if (expectedVersion && current.version !== expectedVersion) throw new SchoolError("PHASE_CONFLICT", "A fase mudou enquanto você editava. Atualize e tente de novo.", 409);
      await tx.preparationPhaseRevision.create({
        data: {
          id: randomUUID(), phaseId, version: current.version, reason, changedByUserId: actorUserId!, changedAt: now,
          snapshot: {
            type: current.type, customName: current.customName, startLocalDate: current.startLocalDate, endLocalDate: current.endLocalDate,
            purpose: current.purpose, sportTypes: current.sportTypes, protocolNotes: current.protocolNotes, updatedByUserId: current.updatedByUserId ?? current.createdByUserId,
          },
        },
      });
      return tx.preparationPhase.update({ where: { id: phaseId }, data: { ...input, version: { increment: 1 }, updatedByUserId: actorUserId, updatedAt: now } });
    }, TX);
  }
}

export class SaveMilestone {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, preparationId: string, raw: unknown, milestoneId?: string | null) {
    const preparation = await requireResponsible(this.db, this.clock, actorUserId, preparationId);
    const input = milestoneInputSchema.parse(raw);
    const now = this.clock();
    const saved = await this.db.$transaction(async (tx) => {
      if (input.phaseId && !await tx.preparationPhase.findFirst({ where: { id: input.phaseId, preparationId, removedAt: null }, select: { id: true } })) {
        throw new SchoolError("PHASE_NOT_FOUND", "Fase não encontrada.", 404);
      }
      if (!milestoneId) {
        return tx.preparationMilestone.create({ data: { id: randomUUID(), preparationId, ...input, createdByUserId: actorUserId!, createdAt: now, updatedAt: now } });
      }
      const current = await tx.preparationMilestone.findFirst({ where: { id: milestoneId, preparationId } });
      if (!current) throw new SchoolError("MILESTONE_NOT_FOUND", "Marco não encontrado.", 404);
      if (!isMilestoneOpen(current.status as MilestoneStatus)) throw new SchoolError("MILESTONE_CLOSED", "Este marco já foi decidido.", 409);
      return tx.preparationMilestone.update({ where: { id: milestoneId }, data: { ...input, version: { increment: 1 }, updatedAt: now } });
    }, TX);
    await syncParticipationReminders(this.db, this.clock, preparation.participation.id);
    return saved;
  }
}

export class SetMilestoneStatus {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  /** Planned / in progress / in review / cancelled — never "achieved", never "evidence received". */
  async execute(actorUserId: string | null, milestoneId: string, status: string) {
    const target = z.enum(MILESTONE_MANUAL_STATUSES).parse(status);
    const milestone = await this.db.preparationMilestone.findUnique({ where: { id: opaqueId.parse(milestoneId) }, select: { id: true, preparationId: true, status: true } });
    if (!milestone) throw new SchoolError("MILESTONE_NOT_FOUND", "Marco não encontrado.", 404);
    const preparation = await requireResponsible(this.db, this.clock, actorUserId, milestone.preparationId);
    if (!isMilestoneOpen(milestone.status as MilestoneStatus)) throw new SchoolError("MILESTONE_CLOSED", "Este marco já foi decidido.", 409);
    const now = this.clock();
    await this.db.preparationMilestone.updateMany({ where: { id: milestone.id, status: milestone.status }, data: { status: target, version: { increment: 1 }, updatedAt: now } });
    await syncParticipationReminders(this.db, this.clock, preparation.participation.id);
  }
}

const decisionSchema = z.strictObject({
  decision: z.enum(MILESTONE_DECISIONS),
  observation: z.string().trim().min(1, "Escreva o parecer.").max(5000),
  isVisible: z.boolean().default(true),
});

export class DecideMilestone {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  /** §8.3 — achieved / partially / not achieved is the coach's decision, recorded as a review of the milestone. */
  async execute(actorUserId: string | null, milestoneId: string, raw: unknown) {
    const input = decisionSchema.parse(raw);
    const milestone = await this.db.preparationMilestone.findUnique({ where: { id: opaqueId.parse(milestoneId) }, select: { id: true, preparationId: true, status: true } });
    if (!milestone) throw new SchoolError("MILESTONE_NOT_FOUND", "Marco não encontrado.", 404);
    const preparation = await requireResponsible(this.db, this.clock, actorUserId, milestone.preparationId);
    if (milestone.status === "CANCELLED") throw new SchoolError("MILESTONE_CLOSED", "Este marco foi cancelado.", 409);
    const now = this.clock();
    await this.db.$transaction(async (tx) => {
      await tx.preparationMilestone.update({
        where: { id: milestone.id },
        data: { status: input.decision, decidedAt: now, decidedByUserId: actorUserId, version: { increment: 1 }, updatedAt: now },
      });
      await new SaveCoachReview(this.db, this.clock).saveIn(tx, actorUserId!, {
        target: { type: "milestone", milestoneId: milestone.id },
        observation: input.observation,
        decision: "MILESTONE_DECISION",
        justification: `Marco ${MILESTONE_STATUS_LABELS[input.decision].toLowerCase()}.`,
        isVisible: input.isVisible,
      });
    }, TX);
    await syncParticipationReminders(this.db, this.clock, preparation.participation.id);
  }
}

const linkSchema = z.strictObject({
  assignmentId: opaqueId,
  phaseId: opaqueId.nullish().transform((value) => value ?? null),
  milestoneId: opaqueId.nullish().transform((value) => value ?? null),
});

export class LinkSessionToEvent {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  /** Tags a session with this event (and a phase/milestone of its preparation); linking again updates the tags. */
  async execute(actorUserId: string | null, preparationId: string, raw: unknown) {
    const preparation = await requireResponsible(this.db, this.clock, actorUserId, preparationId);
    const input = linkSchema.parse(raw);
    const now = this.clock();
    return this.db.$transaction(async (tx) => {
      const assignment = await tx.workoutAssignment.findUnique({ where: { id: input.assignmentId }, select: { athleteId: true, coachId: true, status: true } });
      if (!assignment || assignment.athleteId !== preparation.participation.athleteId || assignment.coachId !== preparation.coach?.id || assignment.status === "CANCELLED") {
        throw new SchoolError("WORKOUT_ASSIGNMENT_NOT_FOUND", "Sessão não encontrada entre as suas prescrições deste aluno.", 404);
      }
      if (input.phaseId && !await tx.preparationPhase.findFirst({ where: { id: input.phaseId, preparationId, removedAt: null }, select: { id: true } })) {
        throw new SchoolError("PHASE_NOT_FOUND", "Fase não encontrada.", 404);
      }
      if (input.milestoneId && !await tx.preparationMilestone.findFirst({ where: { id: input.milestoneId, preparationId }, select: { id: true } })) {
        throw new SchoolError("MILESTONE_NOT_FOUND", "Marco não encontrado.", 404);
      }
      const participationId = preparation.participation.id;
      const link = await tx.workoutAssignmentEventLink.upsert({
        where: { assignmentId_participationId: { assignmentId: input.assignmentId, participationId } },
        create: { id: randomUUID(), assignmentId: input.assignmentId, participationId, phaseId: input.phaseId, milestoneId: input.milestoneId, createdByUserId: actorUserId!, createdAt: now },
        update: { phaseId: input.phaseId, milestoneId: input.milestoneId },
      });
      // A session already executed is evidence the moment it is linked.
      if (input.milestoneId && await sessionHasEvidence(tx, input.assignmentId)) await recordMilestoneEvidence(tx, input.assignmentId, now);
      return link;
    }, TX);
  }
}

export class UnlinkSessionFromEvent {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, preparationId: string, linkId: string) {
    const preparation = await requireResponsible(this.db, this.clock, actorUserId, preparationId);
    const removed = await this.db.workoutAssignmentEventLink.deleteMany({ where: { id: opaqueId.parse(linkId), participationId: preparation.participation.id } });
    if (removed.count === 0) throw new SchoolError("NOT_FOUND", "Ligação não encontrada.", 404);
  }
}

const moveSchema = z.strictObject({
  assignmentIds: z.array(opaqueId).min(1).max(60).transform((ids) => [...new Set(ids)]),
  shiftDays: z.number().int().min(-120).max(120).refine((value) => value !== 0, "Informe quantos dias mover."),
  reason: z.string().trim().max(500).nullish().transform((value) => value || null),
});

export type MovePreviewRow = {
  assignmentId: string;
  title: string;
  fromLocal: string | null;
  toLocal: string | null;
  status: "READY" | "BLOCKED";
  reason: string | null;
  conflicts: string[];
};

/** §22.4 — after an event moves, the coach moves a block of the linked sessions: preview first, then versions. */
export class MoveSessionBlock {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  private async plan(actorUserId: string | null, preparationId: string, raw: unknown) {
    const preparation = await requireResponsible(this.db, this.clock, actorUserId, preparationId);
    const input = moveSchema.parse(raw);
    const athleteId = preparation.participation.athleteId;
    const scope = preparation.schoolId ?? { kind: "independent" as const };
    const linked = await this.db.workoutAssignmentEventLink.findMany({ where: { participationId: preparation.participation.id, assignmentId: { in: input.assignmentIds } }, select: { assignmentId: true } });
    if (linked.length !== input.assignmentIds.length) throw new SchoolError("VALIDATION_ERROR", "Só sessões ligadas a este evento podem ser movidas daqui.", 422);
    const context = await new ResolveCoachAthleteContext(this.db, this.clock).execute(actorUserId, scope, athleteId);
    const baselines = new GetRevisionBaseline(this.db, this.clock);
    const rows: Array<MovePreviewRow & { baseline?: Awaited<ReturnType<GetRevisionBaseline["execute"]>> }> = [];
    for (const assignmentId of input.assignmentIds) {
      const baseline = await baselines.execute(actorUserId, scope, athleteId, assignmentId);
      const fromLocal = baseline.before.scheduledAtLocal;
      const toLocal = fromLocal ? `${shiftLocalDate(fromLocal.slice(0, 10), input.shiftDays)}${fromLocal.slice(10)}` : null;
      if (!toLocal || baseline.executed) {
        rows.push({ assignmentId, title: baseline.before.title, fromLocal, toLocal, status: "BLOCKED", reason: baseline.executed ? "Já executada: fica como está." : "Sem data marcada.", conflicts: [] });
        continue;
      }
      const dayStart = localDateTimeToUtc(`${toLocal.slice(0, 10)}T00:00`, context.timeZone);
      const others = await this.db.workoutAssignment.findMany({
        where: { athleteId, status: { not: "CANCELLED" }, id: { notIn: input.assignmentIds }, scheduledAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } },
        select: { workout: { select: { title: true } } },
      });
      rows.push({ assignmentId, title: baseline.before.title, fromLocal, toLocal, status: "READY", reason: null, conflicts: others.map((other) => other.workout?.title ?? "Sessão"), baseline });
    }
    return { input, scope, athleteId, rows };
  }

  async preview(actorUserId: string | null, preparationId: string, raw: unknown): Promise<MovePreviewRow[]> {
    const { rows } = await this.plan(actorUserId, preparationId, raw);
    return rows.map((row) => ({
      assignmentId: row.assignmentId, title: row.title, fromLocal: row.fromLocal, toLocal: row.toLocal, status: row.status, reason: row.reason, conflicts: row.conflicts,
    }));
  }

  async apply(actorUserId: string | null, preparationId: string, raw: unknown) {
    const { input, scope, athleteId, rows } = await this.plan(actorUserId, preparationId, raw);
    const revise = new ReviseWorkoutAssignment(this.db, this.clock);
    const moved: string[] = [];
    for (const row of rows) {
      if (row.status !== "READY" || !row.baseline) continue;
      const ids = await this.db.workoutAssignment.findUnique({ where: { id: row.assignmentId }, select: { workoutId: true, amendmentWorkoutId: true } });
      const versionId = ids?.amendmentWorkoutId ?? ids?.workoutId ?? null;
      const current = versionId ? await this.db.workout.findUnique({ where: { id: versionId }, select: { snapshotPayload: true, sessionContext: true } }) : null;
      const session = (current?.snapshotPayload as { content?: { session?: unknown } } | null)?.content?.session ?? null;
      // The open-water context is stored as the version's sessionContext (SAM-65).
      const openWater = current?.sessionContext ?? null;
      await revise.execute(actorUserId, scope, athleteId, row.assignmentId, {
        expectedVersion: row.baseline.prescriptionVersion,
        reason: input.reason ?? "evento mudou de data",
        prescription: {
          ...row.baseline.before,
          scheduledAtLocal: row.toLocal,
          templateId: row.baseline.templateId,
          templateVersion: row.baseline.templateVersion,
          ...(session ? { sessionV2: session } : {}),
          ...(openWater ? { openWater } : {}),
        },
      });
      moved.push(row.assignmentId);
    }
    return { moved, skipped: rows.filter((row) => !moved.includes(row.assignmentId)).map((row) => row.assignmentId) };
  }
}
