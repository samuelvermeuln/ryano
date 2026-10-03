/**
 * SAM-55 — follow-up tasks and the notices that announce them (§7.1–7.3, AC02).
 *
 * `raiseFollowUp` and `NotificationService.notify({ dedupeKey })` are both
 * idempotent: reprocessing the same change yields one task and one notice.
 * A later change of the same source while the task is open updates it (a
 * transition "UPDATED" with the reason) instead of piling new tasks (§7.3);
 * a closed task is reopened with history. Both run inside the caller's
 * transaction (SAM-29) and call nothing external.
 *
 * Access is re-checked on every read: the assignee only while their link to
 * the athlete is still active, the school queue only for its OWNER/ADMIN.
 * A revoked coach gets 404 and no longer sees the task (§7.3, AC21).
 */
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { NotificationService, type UserNotificationKind } from "@/modules/shared/notifications";
import { SchoolError } from "../domain/errors";
import {
  FOLLOW_UP_ACTION_FROM,
  FOLLOW_UP_ACTION_TARGET,
  isOpenFollowUp,
  OPEN_FOLLOW_UP_STATUSES,
  type FollowUpAction,
} from "../domain/follow-up-task";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";
import { CanReadAthleteCurrentData } from "./can-read-athlete-current-data";

type Clock = () => Date;
type Db = PrismaClient | Prisma.TransactionClient;
const opaqueId = z.string().min(1).max(256);

export type RaiseFollowUpInput = {
  kind: UserNotificationKind;
  sourceType: string;
  sourceId: string;
  athleteId: string;
  /** A user, or null for the school's coordination queue (then `schoolId` is required). */
  assigneeUserId: string | null;
  schoolId: string | null;
  title: string;
  href: string | null;
  dedupeKey: string;
  priority?: "LOW" | "NORMAL" | "HIGH";
  dueAt?: Date | null;
  /** Why it was raised/updated, kept in the history. */
  reason: string;
  actorUserId: string | null;
};

export async function raiseFollowUp(db: Db, now: Date, input: RaiseFollowUpInput): Promise<{ id: string; created: boolean }> {
  const id = randomUUID();
  const { count } = await db.followUpTask.createMany({
    data: [{
      id, kind: input.kind, sourceType: input.sourceType, sourceId: input.sourceId, athleteId: input.athleteId,
      assigneeUserId: input.assigneeUserId, schoolId: input.schoolId, title: input.title, href: input.href,
      priority: input.priority ?? "NORMAL", dueAt: input.dueAt ?? null, dedupeKey: input.dedupeKey,
      createdAt: now, updatedAt: now,
    }],
    skipDuplicates: true,
  });
  if (count === 1) {
    await db.followUpTaskTransition.create({ data: { id: randomUUID(), taskId: id, fromStatus: null, toStatus: "NEW", actorUserId: input.actorUserId, reason: input.reason, at: now } });
    return { id, created: true };
  }
  const existing = await db.followUpTask.findUniqueOrThrow({ where: { dedupeKey: input.dedupeKey } });
  const reopen = !isOpenFollowUp(existing.status);
  await db.followUpTask.update({
    where: { id: existing.id },
    data: {
      ...(reopen ? { status: "NEW", resolvedAt: null, rescheduledTo: null } : {}),
      assigneeUserId: input.assigneeUserId, schoolId: input.schoolId, title: input.title, href: input.href,
      version: { increment: 1 }, updatedAt: now,
    },
  });
  await db.followUpTaskTransition.create({
    data: { id: randomUUID(), taskId: existing.id, fromStatus: existing.status, toStatus: reopen ? "NEW" : existing.status, actorUserId: input.actorUserId, reason: `${reopen ? "reaberta" : "atualizada"}: ${input.reason}`, at: now },
  });
  return { id: existing.id, created: false };
}

/** OWNER/ADMIN of a school — the "coordenação autorizada" of §7.1. */
export async function schoolManagerUserIds(db: Db, schoolId: string): Promise<string[]> {
  const rows = await db.schoolMembership.findMany({
    where: { schoolId, status: "ACTIVE", endedAt: null, roles: { some: { role: { in: ["OWNER", "ADMIN"] } } } },
    select: { userId: true },
  });
  return [...new Set(rows.map((row) => row.userId))];
}

/** Open tasks of a source move to a new owner when an authorized decision changed the responsible (§7.3). */
export async function transferOpenFollowUps(db: Db, now: Date, sourceType: string, sourceId: string, assigneeUserId: string | null, actorUserId: string | null, reason: string) {
  const open = await db.followUpTask.findMany({ where: { sourceType, sourceId, status: { in: [...OPEN_FOLLOW_UP_STATUSES] } }, select: { id: true, status: true, assigneeUserId: true } });
  for (const task of open) {
    if (task.assigneeUserId === assigneeUserId) continue;
    await db.followUpTask.update({ where: { id: task.id }, data: { assigneeUserId, version: { increment: 1 }, updatedAt: now } });
    await db.followUpTaskTransition.create({ data: { id: randomUUID(), taskId: task.id, fromStatus: task.status, toStatus: task.status, actorUserId, reason, at: now } });
  }
}

/** Notice + task to each recipient (or the school queue when there is no user). */
export async function notifyFollowUp(db: Db, now: Date, input: {
  recipients: string[];
  kind: UserNotificationKind;
  noticeTitle: string;
  noticeBody: string;
  noticeDedupeKey: string;
  href: (userId: string | null) => string | null;
  /** `queue`: the recipients are the school's coordination — one shared task, not one per manager. */
  task: (Omit<RaiseFollowUpInput, "assigneeUserId" | "kind" | "href" | "dedupeKey"> & { dedupeKey: (userId: string | null) => string; queue: boolean }) | null;
}) {
  const notifications = new NotificationService(db, () => now);
  for (const userId of input.recipients) {
    await notifications.notify({ userId, kind: input.kind, title: input.noticeTitle, body: input.noticeBody, href: input.href(userId), dedupeKey: input.noticeDedupeKey });
  }
  if (!input.task) return;
  const { dedupeKey, queue, ...task } = input.task;
  if (queue) {
    if (task.schoolId) await raiseFollowUp(db, now, { ...task, kind: input.kind, assigneeUserId: null, href: input.href(null), dedupeKey: dedupeKey(null) });
    return;
  }
  for (const userId of input.recipients) {
    await raiseFollowUp(db, now, { ...task, kind: input.kind, assigneeUserId: userId, href: input.href(userId), dedupeKey: dedupeKey(userId) });
  }
}

// --- Reading and acting ------------------------------------------------------

const taskInclude = {
  athlete: { select: { name: true } },
  transitions: { orderBy: { at: "asc" as const }, include: { actor: { select: { name: true } } } },
} satisfies Prisma.FollowUpTaskInclude;
type TaskRow = Prisma.FollowUpTaskGetPayload<{ include: typeof taskInclude }>;

async function canAct(db: PrismaClient, clock: Clock, actorUserId: string, task: TaskRow): Promise<boolean> {
  if (task.assigneeUserId === actorUserId) {
    return new CanReadAthleteCurrentData(db, clock).execute(actorUserId, { athleteId: task.athleteId, schoolId: task.schoolId });
  }
  if (task.schoolId) return new CanManageSchool(new SchoolMembershipRepository(db)).execute(actorUserId, task.schoolId);
  return false;
}

function toView(task: TaskRow, now: Date) {
  const deadline = task.rescheduledTo ?? task.dueAt;
  return {
    id: task.id,
    kind: task.kind,
    sourceType: task.sourceType,
    sourceId: task.sourceId,
    title: task.title,
    href: task.href,
    athleteId: task.athleteId,
    athleteName: task.athlete.name,
    schoolId: task.schoolId,
    queue: task.assigneeUserId === null,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    rescheduledTo: task.rescheduledTo,
    overdue: isOpenFollowUp(task.status) && deadline !== null && deadline < now,
    createdAt: task.createdAt,
    resolvedAt: task.resolvedAt,
    version: task.version,
    transitions: task.transitions.map((transition) => ({
      fromStatus: transition.fromStatus, toStatus: transition.toStatus, actorName: transition.actor?.name ?? null, reason: transition.reason, at: transition.at,
    })),
  };
}
export type FollowUpTaskView = ReturnType<typeof toView>;

const listSchema = z.strictObject({
  status: z.enum(["open", "all", "RESOLVED", "CANCELLED"]).default("open"),
  /** Period of the counters and the list, by creation (§19.2). */
  days: z.coerce.number().int().min(1).max(366).nullish(),
});

export class ListFollowUpTasks {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, raw: unknown = {}) {
    if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const filter = listSchema.parse(raw);
    const now = this.clock();
    const since = filter.days ? new Date(now.getTime() - filter.days * 86_400_000) : null;
    const managed = await this.db.schoolMembership.findMany({
      where: { userId: actorUserId, status: "ACTIVE", endedAt: null, roles: { some: { role: { in: ["OWNER", "ADMIN"] } } } },
      select: { schoolId: true },
    });
    const rows = await this.db.followUpTask.findMany({
      where: {
        OR: [{ assigneeUserId: actorUserId }, { assigneeUserId: null, schoolId: { in: managed.map((row) => row.schoolId) } }],
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      include: taskInclude,
      orderBy: [{ createdAt: "desc" }],
      take: 500,
    });
    const visible: TaskRow[] = [];
    for (const row of rows) if (await canAct(this.db, this.clock, actorUserId, row)) visible.push(row);
    const views = visible.map((row) => toView(row, now));
    const counters = {
      open: views.filter((task) => isOpenFollowUp(task.status)).length,
      overdue: views.filter((task) => task.overdue).length,
      resolved: views.filter((task) => task.status === "RESOLVED").length,
    };
    const priorityRank = { HIGH: 0, NORMAL: 1, LOW: 2 } as Record<string, number>;
    const tasks = views
      .filter((task) => filter.status === "all" || (filter.status === "open" ? isOpenFollowUp(task.status) : task.status === filter.status))
      .sort((a, b) => Number(b.overdue) - Number(a.overdue)
        || (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1)
        || ((a.rescheduledTo ?? a.dueAt)?.getTime() ?? Infinity) - ((b.rescheduledTo ?? b.dueAt)?.getTime() ?? Infinity));
    return { counters, periodDays: filter.days ?? null, tasks };
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("see"), expectedVersion: z.number().int().min(1) }),
  z.strictObject({ action: z.literal("start"), expectedVersion: z.number().int().min(1) }),
  z.strictObject({ action: z.literal("resolve"), expectedVersion: z.number().int().min(1), reason: z.string().trim().max(500).nullish() }),
  z.strictObject({
    action: z.literal("reschedule"),
    expectedVersion: z.number().int().min(1),
    rescheduledTo: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(1, "Informe o motivo do reagendamento.").max(500),
  }),
  z.strictObject({ action: z.literal("cancel"), expectedVersion: z.number().int().min(1), reason: z.string().trim().min(1, "Informe o motivo.").max(500) }),
]);

export class GetFollowUpTask {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  /** Opening the task marks it SEEN — never RESOLVED (§7.2). */
  async execute(actorUserId: string | null, taskId: string): Promise<FollowUpTaskView> {
    const task = await loadAuthorized(this.db, this.clock, actorUserId, taskId);
    if (task.status === "NEW") return new ChangeFollowUpTask(this.db, this.clock).execute(actorUserId, taskId, { action: "see", expectedVersion: task.version });
    return toView(task, this.clock());
  }
}

async function loadAuthorized(db: PrismaClient, clock: Clock, actorUserId: string | null, taskId: string) {
  if (!actorUserId) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
  const task = await db.followUpTask.findUnique({ where: { id: opaqueId.parse(taskId) }, include: taskInclude });
  if (!task || !await canAct(db, clock, actorUserId, task)) throw new SchoolError("FOLLOW_UP_NOT_FOUND", "Pendência não encontrada.", 404);
  return task;
}

export class ChangeFollowUpTask {
  constructor(private readonly db: PrismaClient, private readonly clock: Clock = () => new Date()) {}

  async execute(actorUserId: string | null, taskId: string, raw: unknown): Promise<FollowUpTaskView> {
    const input = actionSchema.parse(raw);
    const task = await loadAuthorized(this.db, this.clock, actorUserId, taskId);
    const action: FollowUpAction = input.action;
    if (!(FOLLOW_UP_ACTION_FROM[action] as readonly string[]).includes(task.status)) {
      throw new SchoolError("FOLLOW_UP_INVALID_STATE", "Esta pendência não permite essa ação no estado atual.", 409);
    }
    const now = this.clock();
    const to = FOLLOW_UP_ACTION_TARGET[action];
    const rescheduledTo = input.action === "reschedule" ? new Date(input.rescheduledTo) : undefined;
    if (rescheduledTo && rescheduledTo <= now) throw new SchoolError("VALIDATION_ERROR", "A nova data precisa estar no futuro.", 400);
    const reason = "reason" in input ? input.reason ?? null : null;

    await this.db.$transaction(async (tx) => {
      const updated = await tx.followUpTask.updateMany({
        where: { id: task.id, version: input.expectedVersion },
        data: {
          status: to,
          version: { increment: 1 },
          updatedAt: now,
          ...(rescheduledTo ? { rescheduledTo } : {}),
          ...(to === "RESOLVED" ? { resolvedAt: now } : {}),
          // Taking a queue task makes the manager its owner.
          ...(input.action === "start" && task.assigneeUserId === null ? { assigneeUserId: actorUserId } : {}),
        },
      });
      if (updated.count === 0) throw new SchoolError("FOLLOW_UP_CONFLICT", "Esta pendência foi alterada por outra pessoa. Recarregue e tente de novo.", 409);
      await tx.followUpTaskTransition.create({ data: { id: randomUUID(), taskId: task.id, fromStatus: task.status, toStatus: to, actorUserId, reason, at: now } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const fresh = await this.db.followUpTask.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude });
    return toView(fresh, now);
  }
}
